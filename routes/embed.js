var util = require('../common/util')
var query = require('../common/query')
var db = require('../common/db')
var constants = require('../common/constants')
var AccessTokens = require('../lib/access-tokens')
var logger = require('../common/log')
var request = require('request')
var create_lbit = require('../common/create_learn_bit')
var url_utils = require('url')
var _ = require('lodash')

function doRender (res, lbit, topic, user, url, embedSize, info, extOptions) {
  logger.debug('Before embed', lbit._id, topic, url, embedSize)
  var urlType = (lbit ? lbit.type : util.getUrlType(url, null))
  var options = _getUrlOptions(url)
  if (!util.empty(extOptions)) {
    _.merge(options, extOptions)
  }
  var extn = util.getExtension(url)
  var topicId = (topic) ? topic._id : null
  switch (urlType) {
    case 'flash':
    case 'flash-video':
    case 'video':
    case 'rtmp-live':
    case 'hls-live':
    case 'youtube':
    case 'vimeo':
    case 'audio':
    case 'annotag':
    case 'timetag':
      res.render('lbits/video-embed.ejs', {lbit: lbit, topic: topic, user: user, type: urlType, url: url, extn: extn, embed: true, embedSize: embedSize, info: info, options: options})
      break
    case 'pdf':
      query.get_pdf_last_position(user, lbit._id, topicId, function (err, lastPosition) {
        if (err) {
          logger.error(err)
        }
        AccessTokens.create('' + lbit._id, { added_by: user._id, valid_for_users: [user._id], ttl: 30 * 60, domain: constants.ALLOWED_EMBED_DOMAINS }, function (err, accessToken) {
          if (err) {
            logger.error(err)
          }
          res.render('lbits/embedded.ejs', { lbit: lbit, user: user, topicId: topicId, lastPosition: lastPosition, embed: true, embedSize: embedSize, info: false, options: options, accessToken: accessToken })
        })
      })
      break
    case 'iframe-embed':
      AccessTokens.create('' + lbit._id, { added_by: user._id, valid_for_users: [user._id], ttl: 30 * 60, domain: constants.ALLOWED_EMBED_DOMAINS }, function (err, accessToken) {
        if (err) {
          logger.error(err)
        }
        res.render('lbits/embedded.ejs', { lbit: lbit, user: user, topicId: topicId, embed: true, embedSize: embedSize, info: false, options: options, accessToken: accessToken })
      })
      break
    case 'poll':
      res.render('polls/poll-view.ejs', {lbit: lbit, user: user, topicId: topicId, embed: true, embedSize: embedSize, info: false, options: options})
      break
    case 'inline-html':
      res.render('lbits/readable.ejs', {lbit: lbit, user: user, topicId: topicId, embed: true, embedSize: embedSize, info: false, options: options})
      break
    case 'hstalks':
      res.render('lbits/video-embed.ejs', {lbit: lbit, topic: topic, user: user, type: urlType, url: url, extn: extn, embed: true, embedSize: embedSize, info: info, options: options})
      break
    default:
      res.redirect(lbit.url || url)
      break
  }
}

function embed_url (req, res) {
  var url = req.query.url
  if (!url) {
    res.status(500).send('Unable to embed this url')
    return
  }
  var embedSize = req.query.embedSize || 'large'
  var info = !(req.query.info === 'false')
  var topicOid = req.query.topicId || null
  var user = req.user || constants.DEMO_USER
  var extOptions = _getUrlOptions(req.url)
  function _render () {
    query.get_learnbit(user, {url: url}, function (err, lbit) {
      if (err) {
        logger.error(err)
      }
      if (lbit) {
        var topic = (lbit.topics && lbit.topics.length) ? lbit.topics[0] : null
        doRender(res, lbit, topic, user, url, embedSize, info, extOptions)
      } else {
        var topicPath = util.list_to_path([constants.DISCUSSED, topicOid, user._id])
        var tmpTitle = null
        var tmpId = util.idify(url)
        var tmpName = url
        if (url.indexOf('.flv') !== -1 || url.indexOf('.mp4') !== -1) {
          tmpTitle = 'Recording'
          tmpId = util.idify(tmpTitle)
          tmpName = tmpTitle
        }
        query.find_or_create_topic(topicPath, tmpName, tmpId, null, user._id, null, null, function (err, topic) {
          if (err) {
            logger.error(err)
          }
          query.get_learnbit(user, {url: url, topics: {_id: '' + topic._id}}, function (err, lbit) {
            if (err) {
              logger.error(err)
            }
            if (lbit) {
              doRender(res, lbit, topic, user, url, embedSize, info, extOptions)
            } else {
              create_lbit(topic.id, {topic_oid: '' + topic._id, url: url, body: null, path: topic.path, author: user._id, title: tmpTitle}, function (err, lbit, isUpdate) {
                if (err) {
                  logger.error(err)
                }
                doRender(res, lbit, topic, user, url, embedSize, info, extOptions)
              })
            }
          })
        })
      }
    })
  }
  logger.log('debug', 'Trying to embed', url, topicOid, info)
  if (util.isInternalUrl(url)) {
    var extractedTopic = util.getTopicFromUrl(url)
    var extractedLbit = util.getLbitFromUrl(url)
    var lbit_id = null
    if (extractedLbit && extractedLbit._id) {
      lbit_id = extractedLbit._id
    } else if (url.indexOf('lbit=') !== -1) {
      var lindex = url.indexOf('lbit=')
      lbit_id = url.substring(lindex + 5)
    }
    // console.log(extractedTopic, extractedLbit, lbit_id)
    if (lbit_id) {
      query.get_learnbit(user, {_id: db.ObjectId(lbit_id)}, function (err, lbit) {
        if (err) {
          logger.error(err)
        }
        if (lbit) {
          var topic = (lbit.topics && lbit.topics.length) ? lbit.topics[0] : null
          doRender(res, lbit, topic, user, url, embedSize, info, extOptions)
        } else {
          logger.log('warn', 'No learnbit found for id', lbit_id, '. Redirecting to', url)
          res.redirect(url)
        }
      })
    } else if (!util.empty(extractedTopic) && extractedTopic.oid) {
      var tidToUse = extractedTopic.oid
      var options = _getUrlOptions(url)
      if (!util.empty(extOptions)) {
        _.merge(options, extOptions)
      }
      res.render('topic/embed.ejs', {user: user, embedSize: embedSize, embed: true, info: info,
      url: url, topic: {_id: tidToUse}, type: (extractedTopic.type || 'topic'), options: options})
    } else {
      _render()
    }
  } else {
    _render()
  }
}

function _getUrlOptions (url) {
  var urlObj = url_utils.parse(url)
  var options = {}
  if (urlObj.query) {
    options = util.query_to_json(urlObj.query)
    options.query = encodeURIComponent(urlObj.query)
  }
  return options
}

function embed_lbit (req, res) {
  var oid = req.params.oid
  var embedSize = req.query.embedSize || 'large'
  var info = req.query.info !== 'false'
  var topicId = req.query.topicId || null
  var user = req.user || constants.DEMO_USER
  var topic = topicId ? {_id: topicId} : null

  /**
   * We need extract the options specified in the original url
   */
  var extOptions = _getUrlOptions(req.url)
  query.get_learnbit(user, {_id: db.ObjectId(oid)}, function (err, lbit) {
    if (!err && lbit) {
      if (!topic && lbit.topics) {
        topic = lbit.topics[0]
      }
      doRender(res, lbit, topic, user, lbit.url, embedSize, info, extOptions)
    } else {
      res.status(500).send('Invalid learnbit id!')
    }
  })
}

function proxy_url (req, res) {
  var url = req.query.url
  // If this is a relative url simply redirect
  if (url.indexOf('/') === 0) {
    // logger.log('debug', 'Redirecting to local url', url)
    res.redirect(url)
    return
  }
  if (util.empty(url)) {
    res.status(500).send('Invalid url!')
    return
  }
  request.get(url)
    .on('response', function (response) {
      if (response.statusCode !== 200) {
        logger.log('warn', 'Unable to proxy', url, '. Response code:', response.statusCode)
      }
    })
    .on('error', function (err) {
      logger.error('Unable to proxy url', url, err)
      res.end()
    })
    .pipe(res)
}

function embed_topic (req, res) {
  // var oid = req.params.oid
}

exports.embed_url = function (req, response) {
  embed_url(req, response)
}

exports.proxy_url = function (req, response) {
  proxy_url(req, response)
}

exports.embed_lbit = function (req, response) {
  embed_lbit(req, response)
}

exports.embed_topic = function (req, response) {
  embed_topic(req, response)
}
