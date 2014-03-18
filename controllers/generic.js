var enums = require('../enums');
var common = require('../static/js/common');
var utils = require('utilities');

exports.genericErrorHandler = function (req, res, err) {
    if (!err) {
        err = {};
    }
    if (err.code === 2) {
        res.status(404);
        res.end('Error 404: Not found');
        console.r.error(req, 404, err);
    } else {
        res.status(500);
        res.end('Error 500: Internal Server Error');
        console.r.error(req, 500, err);
    }
};

exports.headErrorHandler = function (req, res, err) {
    if (!err) {
        err = {};
    }
    if (err.code === 2) {
        res.status(404);
        console.r.error(req, 404, err);
    } else {
        res.status(500);
        console.r.error(req, 500, err);
    }
    res.end();
    req.destroy();
};

// Joins Post data with model instance data.
exports.join = function (item, post) {
    var i;
    // Delete the auto-added post object in item.
    if (item.hasOwnProperty('post')) {
        delete item.post;
    }
    for (i in post) {
        if (post.hasOwnProperty(i) && i !== 'id') {
            // Don't put in id properties
            // as they are already covered by {model}_id
            // in the association at the other end.
            item[i] = post[i];
        }
    }

    return item;
};
var join = exports.join;



// Creates an instance of model, creates a Post and links the model instance
// to the created post.
// Calls back with the created instance of model.
exports.create = function (model, data, req, cb) {
    
    common.validateDateTimeOccurred(req.body.targetDateTimeOccurred, null, null, function(error, targetDateTimeOccurred) {
        if (!error) {
            
            // Create the model item.
            model.create([data], function (err, items) {
                if (err) {
                    cb(err, null);
                }
                // items = array of inserted items 
                // After the item has been created.
                // We only add one item, so use items[0].
                var item = items[0];
           
                // Tags: tag1, tag2, tag3, ..., tagN
                var tags = null;
                if (req.body.hasOwnProperty('tags')) {
                    tags = common.tagize(req.body.tags);
                }
        
                // We want to store the created and updated date
                // in UTC -- Date.now() returns current time in milliseconds since 1970 in UTC.
                var now = new Date(Date.now());
                
                var postData = {
                    title: req.body.title,
                    text: req.body.text,
                    targetImage: req.body.targetImage,
                    targetLocality: req.body.targetLocality,
                    targetLat: req.body.targetLat,
                    targetLong: req.body.targetLong,
                    date: now,
                    author: req.user.name,
                    tags: tags,
                    updated: now
                }
                
                postData.targetDateTimeOccurred = targetDateTimeOccurred;
        


                req.models.Post.create([postData], function (err, items) {
                    if (err) {
                        cb(err, null);
                    }

                    var post = items[0];
                    post.setUser(req.user, function (err) {
                        post.save(function (err) {
                            if (err) {
                                cb(err, null);
                            }
                        });
                    });
                    

                    // After the post has been created,
                    // add the association to its subclass – item.
                    // We only add one post, so use items[0].
                    item.setPost(post, function (err) {
                        if (err) {
                            cb(err, null);
                        }

                        item.save(function (err) {
                            if (err) {
                                cb(err, null);
                            }

                            // Call back with the created instance of model.
                            cb(null, item);
                        });
                    });
                });
            });
        }
    });
    


};

// Removes quotes from a string
function cutQuotes(str) {
    if (str.charAt(0) === '"' && str.charAt(str.length - 1) === '"') {
        str = str.substring(1, str.length - 1);
    }
    return str;
}


// reqIfNoneMatch can be undefined, if so: it will return the model instance.
exports.get = function (model, id, reqIfNoneMatch, cb) {
    model.get(id, function (err, item) {
        // Get the item and data from the post.
        if (!err) {
            // Add the post fields to the output.
            item.getPost(function (err, post) {
                if (!err && post) {
//                    Used for caching
                    // If reqIfNoneMatch is present, compare with it.
//                    if (reqIfNoneMatch && post.updated === cutQuotes(reqIfNoneMatch)) {
//                        // Client has latest version:
//                        // resource has NOT changed
//                        cb(enums.NOT_MODIFIED);
//                    } else {
                        // Client does not have latest version:
                        // resource has changed.
                    exports.load_post_ratings_count(item, function(err){
                        if(err){
                            cb(err, null);
                        }
                        else{
                            cb(null, item);
                        }
                    });
//                    }
                } else {
                    cb({}, null);
                }
            });
        } else {
            cb(err, null);
        }
    });
};

exports.update = function (model, id, req, cb) {
    
    common.validateDateTimeOccurred(req.body.targetDateTimeOccurred, null, null, function(error, targetDateTimeOccurred) {
        if (!error) {
            
            // Set req.body.targetDateTimeOccurred to constructed Date object.
            if (targetDateTimeOccurred) {
                req.body.targetDateTimeOccurred = targetDateTimeOccurred;
            } else {
                delete req.body.targetDateTimeOccurred;
            }
            
            
            model.get(id, function (err, item) {

                var itemNew = {},
                    postNew = {},
                    i = {};
            
                // Tags: tag1, tag2, tag3, ..., tagN
                if (req.body.hasOwnProperty('tags')) {
                    req.body.tags = common.tagize(req.body.tags);
                }

                for (i in req.body) {
                    if (req.body.hasOwnProperty(i)) {
                        if (model.allProperties.hasOwnProperty(i)) {
                            // Post property has been included in request, update item.
                            itemNew[i] = req.body[i];
                        }

                        if (req.models.Post.allProperties.hasOwnProperty(i)) {
                            // Item property has been included in request, update Post.
                            postNew[i] = req.body[i];
                        }
                    }

                }
                if (itemNew) {
                    // Update item.
                    item.save(itemNew, function (err) {
                        if (err) {
                            throw err;
                        }
                    });
                }
                if (postNew) {
                    // Update post.
                    req.models.Post.get(item.post_id, function (err, post) {
                        var now = new Date().getTime();
                        post.updated = now;
                        post.save(postNew, function (err) {
                            if (err) {
                                throw err;
                            }
                            // Update successful.
                            cb(null);
                        });
                    });
                }
            });
    
    
        }

    });
};

// only remove one item and its post
exports.removeOne = function (item, req, cb) {
    req.models.Post.get(item.post_id, function (err, post) {
        if (!err && post) {
            post.remove(function (err) {
                if (!err) {
                    item.remove(function (err) {
                        if (!err) {
                            //successful.
                            cb(null);
                        } else {
                            cb(err);
                        }
                    });
                } else {
                    cb(err);
                }
            });
        } else {
            cb(err);
        }
    });
};
exports.load_crisis_extra_fields = function(crisis, callback){
    crisis.relativeCreatedDate = utils.date.relativeTime(crisis.post.date, {abbreviated: false});
    crisis.getPost(function(err, post){
        if (!err && post) {
            crisis.importanceCount = crisis.post.getImportanceCount();
            callback();
        }
        else{
            callback(err);
        }
    });
}
exports.load_question_extra_fields = function(question, callback){
    if(question.answers == undefined){
        question.getAnswers(function(err, answers){
            if (!err && answers) {
                question.rejectedAnswerCount = question.getRejectedAnswerCount();
                question.supportedAnswerCount = question.getSupportedAnswerCount();
                if(question.post.ratings == undefined){
                    question.getPost(function(err, post){
                        if (!err && answers) {
                            question.importanceCount = question.post.getImportanceCount();
                            callback();
                        }
                        else{
                            callback(err);
                        }
                    });
                }
                else{
                    question.importanceCount = question.post.getImportanceCount();
                    callback();
                }
            }
            else{
                callback(err);
            }
        });
    }
    else{
        question.rejectedAnswerCount = question.getRejectedAnswerCount();
        question.supportedAnswerCount = question.getSupportedAnswerCount();
        question.importanceCount = question.post.getImportanceCount();
        callback();
    }
}
exports.load_post_ratings_count = function(item, callback){
    item.post.getRatings(function(err, ratings){
        if (!err && ratings) {
            item.post.upvoteCount = item.post.getUpvoteCount();
            item.post.downvoteCount = item.post.getDownvoteCount();
            item.post.importanceCount = item.post.getImportanceCount();
            callback();
        }
        else{
            callback(err);
        }
    });
}

exports.getUserAccounts = function (user, cb) {
    if (user.local_id) {
        user.getLocal();
    }

};