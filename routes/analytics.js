var util = require ("../common/util")
    , userlib = require('../lib/user')
    , db = require("../common/db")
    , query = require("../common/query")
    , logger = require('../common/log')
    , _ = require('lodash');

function _getHeaders(req, type) {
    var user = req.user || {_id: 'guest'};
    var data = {
        user: user._id,
        url: req.url,
        type: type,
        timestamp: new Date(),
        ip: req.socket.address()
    };
    _.merge(data, req.query);
    _.merge(data, req.headers);
    data.cookie = null;
    return data;
}

function _track(req, response, type) {
    var data = _getHeaders(req, type);
    //console.log(data);
    switch(type) {
        case 'app':
          db.app_analytics.insert(data);
          break;
        case 'pdf':
        case 'topic':
        case 'url':
        case 'lbit':
          db.analytics.insert(data);
          break;
        default:
          data.t = Math.round(parseInt(data.t, 10));
          db.vanalytics.insert(data);
          break;
    }

    if(response) {
        response.send("1");
    }
}

function get_video_last_position(req, response) {
    var user = req.user || {_id: 'guest'};
    var data = _getHeaders(req, 'video');
    query.get_video_last_position(user, data.lbit_id, data.topic_id, function (err, value) {
        //console.log('Last position', value);
        response.send({lastPosition: value});
    });
}

function get_pdf_last_position(req, response) {
    var user = req.user || {_id: 'guest'};
    var data = _getHeaders(req, 'pdf');
    query.get_pdf_last_position(user, data.lbit_id, data.topic_id, function (err, value) {
        //console.log('Last pdf position', value);
        response.send({lastPosition: value});
    });
}

exports.url_track = function(req, response) {
    _track(req, response, 'url');
}

exports.app_track = function(req, response) {
    _track(req, response, 'app');
}

exports.topic_track = function(req, response) {
    _track(req, response, 'topic');
}

exports.lbit_track = function(req, response) {
    _track(req, response, 'lbit');
}

exports.youtube_track = function(req, response) {
    _track(req, response, 'youtube');
}

exports.vimeo_track = function(req, response) {
    _track(req, response, 'vimeo');
}

exports.video_track = function(req, response) {
    _track(req, response, 'video');
}

exports.slideshare_track = function(req, response) {

}

exports.pdf_track = function(req, response) {
    _track(req, response, 'pdf');
}

exports.get_video_last_position = function (req, response) {
    get_video_last_position(req, response);
}

exports.get_pdf_last_position = function (req, response) {
    get_pdf_last_position(req, response);
}
