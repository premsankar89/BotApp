function fetchData() {
// Built http request
    var data = '';
    var http = new XMLHttpRequest();
    http.onreadystatechange = function () {
        if (http.readyState === 4 && http.status === 200) {
            data = JSON.parse(http.responseText);
            replace(data);
        }
    };
    http.open('GET', '/configureCloudant', true);
    http.send();
}

function replace(data){
    //TODO: Replace with jquery/Angular/etc
    if (data.conv_username) {
        document.getElementsByName('conv_username')[0].value = data.conv_username;
    }
    if (data.conv_password) {
        document.getElementsByName('conv_password')[0].value = data.conv_password;
    }
    if (data.conv_workspace_id) {
        document.getElementsByName('conv_workspace_id')[0].value = data.conv_workspace_id;
    }
    if (data.telegram_token) {
        document.getElementsByName('telegram_token')[0].value = data.telegram_token;
    }
    if (data.groupme_bot_id) {
        document.getElementsByName('groupme_bot_id')[0].value = data.groupme_bot_id;
    }
    if (data.spark_auth) {
        document.getElementsByName('spark_auth')[0].value = data.spark_auth;
    }
}