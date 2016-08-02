/**
 * author : @nadir93
 */
var loglevel = 'debug';
var Logger = require('bunyan'),
  log = new Logger.createLogger({
    name: 'crstankbot',
    level: loglevel
  });
var phantom = require('phantom');
var request = require('request');
var fs = require('fs');
//var _ = require('underscore.string');
var _ = require('underscore');
var WebClient = require('@slack/client').WebClient;
var util = require('util');

var token = process.env.HUBOT_SLACK_TOKEN;
var web = new WebClient(token);

var requestURL = 'https://api.thingspeak.com/channels/27833/feeds.json?results=6000&timezone=Asia/Seoul';

module.exports = function(robot) {

  robot.respond(/수조온도/i, function(msg) {

    log.debug('request', {
      message: msg.message.text,
      user: msg.message.user.name,
      channel: msg.message.user.room
    });

    var host = msg.match[1];
    var channel = msg.message.user.room;
    log.debug('channel=' + channel);

    request(requestURL, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        var feeds = JSON.parse(body).feeds;
        //log.debug('feeds=' + util.inspect(feeds));

        var topdate;
        var toptemp = -1000;
        var bottomdate;
        var bottomtemp = 1000;
        var data = _.filter(feeds, function(obj, index) {
          var tmp = Number(obj.field1);
          if (toptemp < tmp) {
            toptemp = tmp;
            topdate = obj.created_at;
          }

          if (bottomtemp > tmp) {
            bottomtemp = tmp;
            bottomdate = obj.created_at;
          }

          if(feeds.length - 1 == index){
            return true;
          }
          return index % 60 == 0;
        });
        log.debug('data=' + util.inspect(data));
        var result = html.replace(/realdata/g, JSON.stringify(data));

        log.debug('최고온도=' + toptemp);
        log.debug('최고온도일시=' + topdate);
        log.debug('최저온도=' + bottomtemp);
        log.debug('최저온도일시=' + bottomdate);
        // 마커생성
        result = result.replace(/markers:/g, "markers:[{'created_at':new Date('" + topdate + "'),'label':'high : " + toptemp +
          "'},{'created_at':new Date('" + bottomdate + "'),'label':'low : " + bottomtemp + "'}]");

        var tmp = makeid();
        var tmpFile = tmp + '.html';
        log.debug('임시html=' + tmpFile);
        var tmpImgFile = tmp + '.jpeg';
        log.debug('임시이미지=' + tmpImgFile);
        fs.writeFile(__dirname + '/res/' + tmpFile, result, 'utf8', function(err) {
          if (err) {
            msg.reply(err);
            return log.error(err);
          }

          phantom.create().then(function(ph) {
            ph.createPage().then(function(page) {
              page.invokeAsyncMethod('open', __dirname + '/res/' + tmpFile).then(function(status) {
                log.debug('이미지생성=' + status);
                if (status != 'success') {
                  msg.reply('이미지생성에 실패하였습니다');
                }
                //msg.reply('이미지생성=' + status);
                page.render(__dirname + '/res/' + tmpImgFile, {
                  format: 'jpeg',
                  quality: '100'
                });

                var fullPath = __dirname + '/res/' + tmpImgFile;
                log.debug('fullPath=' + fullPath);

                setTimeout(function() {
                  var streamOpts = {
                    title: '수조온도그래프',
                    file: fs.createReadStream(fullPath),
                    channels: channel 
                      //console.log(require('util').inspect(msg.message.user.room, { depth: null }));
                  };

                  web.files.upload(tmpImgFile, streamOpts, function handleStreamFileUpload(err, res) {
                    if (err) {
                      msg.reply(err);
                      return log.error(err);
                    }
                    //msg.reply('이미지가로드되었습니다');
                    log.debug(res);
                  });
                }, 500);
                // File upload via file param
                ph.exit();
              });
            });
          });
        });
      }
    })
  });
}

var html = "<html lang='en'><head><link href='./js/sans.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/italic.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/font-awesome.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/bootstrap.min.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/metricsgraphics.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/metricsgraphics-demo.css' rel='stylesheet' type='text/css'>" +
  "<link href='./js/highlightjs-default.css' rel='stylesheet' type='text/css'>" +
  "<script src='./js/highlight.pack.js'></script><script src='./js/jquery.min.js'>" +
  "</script><script src='./js/d3.v4.min.js' charset='utf-8'></script>" +
  "<script src='./js/metricsgraphics.js'></script></head><body><div id='ufo-sightings' class='mg-main-area-solid'></div>" +
  "<script>hljs.initHighlightingOnLoad();var val=realdata;val=MG.convert.date(val,'created_at',d3.utcParse(\"%Y-%m-%dT%H:%M:%S%Z\"));val=MG.convert.number(val,'field1');MG.data_graphic({title:'nadir93\\'s fishtank temperature',description:'This graphic shows a time-series of downloads.'" +
  ",data:val,width:600,height:200,target:'#ufo-sightings',markers:,min_y_from_data:true,x_accessor:'created_at',y_accessor:'field1'})" +
  "</script></body></html>";

function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 5; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}
