/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------
require( 'dotenv' ).config( {silent: true} );
// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var builder = require('botbuilder');
// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');
var request = require('request');
var path = require('path');

var TelegramBot = require('node-telegram-bot-api');
var watson = require('watson-developer-cloud');
var vcapServices = require( 'vcap_services' );
var util = require('util');
var Cloudant = require('cloudant');
var cloudant = null;
var db = null;

var bodyParser = require("body-parser");

// Bots token stuff
var tbot;
var telegram_token;
var conv_username;  
var conv_password; 
var conv_workspace_id; 
var groupme_bot_id; 
var spark_auth;
var microsoft_app_id;
var microsoft_app_pswd;
var line_cid;
var line_csecret;
var line_acl;
var conversation;
var connector;
var msbot;
var groupme_callback = 'https://api.groupme.com/v3/bots/post';
var spark_webhook = 'https://api.ciscospark.com/v1/messages';
var line_webhook = 'https://trialbot-api.line.me/v1/events';
var line_event = '138311608800106203';
var line_to = '1383378250';
var ctype = "application/json";

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static('./public'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

//Initialize DB here
app.get('/configureCloudant', function (req, res) {
    //TODO: Modify this below to properly handle error cases
    var cloudantCredentials = vcapServices.getCredentials('cloudantNoSQLDB');
    var url = '';
    if (cloudantCredentials) {
        url = cloudantCredentials.url;
    }
    if (url != undefined){
        cloudant = Cloudant(url);
        cloudant.db.get("botkit", function (err, data) {
            if (err) {
                console.log('Error getting Database: ' + err.message);
                //most likely DB doesn't exist
                cloudant.db.create('botkit', function (errCreate) {
                    console.log(errCreate);
                    db = cloudant.db.use('botkit');
                });
                console.log('We created a new DB named botKit since it was not found');
                res.send('ok');
            } else {
                fetchDetails(res);
            }
        });
    } else {
        res.sendStatus(304);
    }
});

function fetchDetails(res) {
    var result = {};
    db = cloudant.use('botkit');
    db.fetch({"keys":['Conversation','Telegram','LineObject','MicrosoftObject','GroupMeObject','SparkObject']},function(err, body) {
        if (!err) {
            body.rows.forEach(function(doc) {
                if( doc.doc != null) {
                    var keys = Object.keys( doc.doc );
                    for( var i = 0,length = keys.length; i < length; i++ ) {
                        result[keys[i]] = doc.doc[keys[i]];
                    }
                }
            });
        }
        delete result['_id'];
        delete result['_rev'];
        res.json(result);
    });
}

function upsertDetails(id, botData) {
    db = cloudant.use('botkit');
    db.get(id, function (err, body) {
        if (!err) {
            botData._rev = body._rev;
            db.insert(botData, id, function (err) {
                if (err) {
                    console.log('upsert failed for ' + id);
                    console.log(err);
                }
            });
        } else {
            console.log(err.message);
            console.log('No Data found,inserting new');
            db.insert(botData, id, function (err) {
                if (err) {
                    console.log('insert failed for ' + id);
                    console.log(err);
                }
            });
        }
    });
}

//Configure all token info here
app.post('/configure', function (req, res) {
    //@sputhana add logging here TODO:logging

    //Configure Conversation
    if (req.body.conv == 1){
        var convoObject = {};
        conv_username = convoObject.conv_username = req.body.conv_username;
        conv_password = convoObject.conv_password = req.body.conv_password;
        conv_workspace_id = convoObject.conv_workspace_id = req.body.conv_workspace_id;
        if( convoObject.conv_username && convoObject.conv_password != '' ){
            configureConversation();
            upsertDetails('Conversation', convoObject);
        }
    }

    if (req.body.tele == 1) {
        //Configure Telegram
        var telegramObject = {};
        telegram_token = telegramObject.telegram_token = req.body.telegram_token;
        if (telegram_token != '') {
            tbot = new TelegramBot(telegram_token, {polling: true});
            configureTelegram();
            upsertDetails('Telegram', telegramObject);
        }
    }

    if (req.body.line == 1) {
        //Configure Line
        var lineObject = {};
        line_cid = lineObject.line_cid = req.body.channel_id;
        line_csecret = lineObject.line_csecret = req.body.channel_secret;
        line_acl = lineObject.line_acl = req.body.user_acl;
        if (line_cid && line_csecret && line_acl != ''){
            upsertDetails('LineObject', lineObject);
        }
    }

    if (req.body.ms == 1) {
        //Configure Microsoft App
        var microsoftObject = {};
        microsoft_app_id = microsoftObject.microsoft_app_id = req.body.microsoft_app_id;
        microsoft_app_pswd = microsoftObject.microsoft_app_pswd = req.body.microsoft_app_pswd;
        if (microsoft_app_id && microsoft_app_pswd != ''){
            configureMSBot();
            upsertDetails('MicrosoftObject', microsoftObject);
        }
    }

    if (req.body.gme == 1) {
        //Configure Group Me
        var groupmeObject = {};
        groupme_bot_id = groupmeObject.groupme_bot_id = req.body.groupme_bot_id;
        if (groupme_bot_id != null) {
            upsertDetails('GroupMeObject', groupmeObject);
        }
    }

    if (req.body.spark == 1){
        //Configure Spark
        var sparkObject = {};
        spark_auth = sparkObject.spark_auth = req.body.spark_auth;
        if (spark_auth != null) {
            upsertDetails('SparkObject', sparkObject);
        }

    }

    res.sendFile(path.join(__dirname + '/public/index.html'));
});

//=========================================================
// MS Bots Dialogs
//=========================================================

function configureMSBot(){
connector = new builder.ChatConnector({
    appId: microsoft_app_id,
    appPassword: microsoft_app_pswd
});
msbot = new builder.UniversalBot(connector);

msbot.dialog('/', function (session) {
 var payload = {
    workspace_id: conv_workspace_id,
    input: {"text":session.message.text},
    context: {}
  };
  conversation.message(payload, function(err, data) {
    if (err) {
      console.log(err);
    }
    else
      session.send('I understood your intent was:'+data.intents[0].intent);
  });
});
// Any kind of Microsoft Chat App message
//Set this endpoint in Microsoft Bot Callback
app.post('/api/messages', connector.listen());
}


function configureConversation() {
	//@sputhana add logging here
conversation = watson.conversation({
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: conv_username,
  password: conv_password,
  version: 'v1',
  version_date: '2016-07-11'
});
}
// Any kind of Telegram message
function configureTelegram(){
	//@sputhana add logging here
tbot.on('message', function (msg) {
  var fromId = msg.from.id;
   var payload = {
    workspace_id: conv_workspace_id,
    input: {"text":msg.text},
    context: {}
  };
  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      console.log(err);
    }
   //console.log(util.inspect(data, {showHidden: false, depth: null}));
   tbot.sendMessage(fromId, 'I think your intent was: '+data.intents[0].intent);
  });
});
}

// Any kind of Line message
//Set this endpoint in Line Bot Callback
app.post('/line', function (req, res) {
	//@sputhana add logging here
  var msg = req.body.result[0].content.text;
  var from_user = req.body.result[0].content.from;
	var payload = {
    workspace_id: conv_workspace_id,
    input: {"text":msg},
    context: {}
  };
  // Send the input to the conversation service to get the intent
  conversation.message(payload, function(err, data) {
    if (err) {
      console.log(err);
    }//
	var text='I think your intent was: '+data.intents[0].intent;
  	var data = {
  "to":[from_user],
  "toChannel":line_to,//Default
  "eventType":line_event,//Default
  "content":{
    "contentType":1,
    "toType":1,
    "text":text
  }
};
	request({
    url: line_webhook,
    method: "POST",
    json: true,
    headers: {
        "X-Line-ChannelID": line_cid,
        "X-Line-ChannelSecret": line_csecret,
        "X-Line-Trusted-User-With-ACL": line_acl,
        "content-type": ctype,
    },
    body: data
},function (err, res, body) {
});
  });
  res.send('Hello World!');
});

// Any kind of Cisco Spark message
app.post('/spark', function (req, res) {
	//@sputhana add logging here
    var roomId = req.body.roomId;
    var msg = req.body.text;
	if(msg.indexOf('I think your intent was: ') > -1) {
		//Dont call Bot reply 
	}
	else{
	var payload = {
    workspace_id: conv_workspace_id,
    input: {"text":msg},
    context: {}
  };
  // Send the input to the conversation service to get the intent
  conversation.message(payload, function(err, data) {
    if (err) {
      console.log(err);
    }//
	var text='I think your intent was: '+data.intents[0].intent;
  	var data = {'roomId':roomId,'text':text};
	request({
    url: spark_webhook,
    method: "POST",
    json: true,
    headers: {
        "content-type": ctype,
		"Authorization": spark_auth 
    },
    body: data
},function (err, res, body) {
 });
  });

	}
  res.send("ok");
});

// Any kind of Groupme Bot message
//Set this endpoint in Groupme Bot Callback
app.post('/groupme', function (req, res) {
	//@sputhana add logging here
   var msg = req.body.text;
   var stype= req.body.sender_type;
	var payload = {
    workspace_id: conv_workspace_id,
    input: {"text":msg},
    context: {}
  };
  if(stype === 'bot') {
		//Dont call Bot reply 
	}
	else{
  // Send the input to the conversation service to get the intent
  conversation.message(payload, function(err, data) {
    if (err) {
      console.log(err);
    }//
	var text='I think your intent was: '+data.intents[0].intent;
	var data = {'bot_id': groupme_bot_id,'text':text};
	request({
    url: groupme_callback,
    method: "POST",
    json: true,
    headers: {
        "content-type": ctype
    },
    body: data
},function (err, res, body) {
 });
  });
}
  res.end();
});
