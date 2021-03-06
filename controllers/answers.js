// Controller for Answer.
var generic = require('./generic');
var enums = require('../enums');
var oembed = require('oembed');
var memwatch = require('memwatch');
var common = require('../static/js/common');
var exifHelper = require('../helpers/exif');

var raiting_controller = require('./ratings');
var query = require('../lib/sqlQueries');

var async = require('async');

var userController = require('./users');
var role = require('../lib/roles').user;

function oneAnswerResponse(res, req, crisis, question, answer, user) {
    res.render('evidence/one', {
        crisis: crisis,
        question: question,
        answer: answer,
        properUser: common.properUser(req),
        page: {
            title: answer.post.title
        },
        user: user,
        properUser: common.properUser(req)
    });
}

// Creates a provisional user if the user is not logged in.
var applyUserAndRespond = function(req, res, crisis, question, answer) {
    if (req.user) {
        // User is currently logged in.
        oneAnswerResponse(res, req, crisis, question, answer, req.user);
    } else {
        // User is not currently logged in --
        // let's make them a provisional account
        // so they can immediately do stuff.
        userController.newProvisionalUser(req, function(err, user) {
            // Provisional user account created.
            // Respond.
            oneAnswerResponse(res, req, crisis, question, answer, req.user);
        });   
    }
};

var addVideo = function(req, res, crisis, question, answer) {
    if(answer.post.targetVideoUrl) {

        oembed.fetch(answer.post.targetVideoUrl, {}, function(err, result) {

            if (!err) {
                answer.post.targetVideoHtml = result.html;
            } else{
                answer.post.VideoUrlNotEmbeddable = answer.post.targetVideoUrl;
            }

            applyUserAndRespond(req, res, crisis, question, answer);
        });
    } else {
        applyUserAndRespond(req, res, crisis, question, answer);
    }
};

// Get a specific answer
var getOne = function (req, res) {
    memwatch.gc();
    // ETag support.
    var reqIfNoneMatch = req.get(enums.ifNoneMatch);

    generic.get(req, req.models.Crisis, req.params.crisis_id, undefined, function (err, crisis) {
        if (!err && crisis) {
            generic.get(req, req.models.Question, req.params.question_id, undefined, function (err, question) {
                if (!err && question) {
                    generic.get(req, req.models.Answer, req.params.answer_id, reqIfNoneMatch, function (err, answer) {
                        if (!err && answer) {
                            if (req.user){var user = req.user; }
                            query.getAnswerRatings(req, answer.post, function (err) {
                                if (err) {
                                    generic.genericErrorHandler(req, res, err);   
                                } else {
                                    query.getCommentsOfAnswer(req, answer.id, function(err, comments){
                                        if (err) {
                                            generic.genericErrorHandler(req, res, err);    
                                        } else {
                                            //Filter comments by provisional users
                                            answer.comments = comments.filter(function(comment){ return common.isUserContentShow({type: comment.type});});
                                            
                                            if (answer.post.targetImage) {
                                                answer.post.targetImageData = {};
                            
                                                exifHelper.extract(answer.post.targetImage, function(exifData) {
                                                    answer.post.targetImageData = exifData;
                
                                                    addVideo(req, res, crisis, question, answer);
                                                });
                                            } else {
                                                addVideo(req, res, crisis, question, answer);
                                            }
                                            
                                        }
                                            
                                    });
                                }
                            });    
                        } else {
                            generic.genericErrorHandler(req, res, err);
                        }
                    });
                } else {
                    generic.genericErrorHandler(req, res, err);
                }
            });

        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

exports.get = [role.can('view challenge pages'), getOne];



exports.head = function (req, res) {
    res.redirect('/');
    res.end();
};

// Get all answers ever, regardless of question id.
var allEver = function (req, res) { // this function finds all answers in db,regardless of the question id.
    req.models.Answer.find({}, function (err, Answers) {
        if (err || !Answers || Answers.length === 0) {
            generic.genericErrorHandler(req, res, err);
        } else {
            async.each(Answers, generic.load_post_ratings_count, function (err) {
                if (err) {
                    generic.genericErrorHandler(req, res, err);
                } else {
                    var wrapper = {
                        answers: Answers
                    };
                    res.status(200);
                    res.json(wrapper);
                    res.end();
                }
            });
        }
    });
};
exports.allEver = [role.can('assign roles'), allEver];

// Get all answers for a specific question.
var all = function (req, res) { // this function finds all answers of an specific question.
    generic.get(req, req.models.Question, req.params.question_id, undefined, function (err, question) {
        if (!err && question) {
            //question exists
            question.getAnswers(function (err, answers) {
                if (err || !answers || answers.length === 0) {
                    err = {};
                    err.code = 2;
                    generic.genericErrorHandler(req, res, err);
                } else {
                    async.each(answers, generic.load_post_ratings_count, function (err) {
                        if (err) {
                            generic.genericErrorHandler(req, res, err);
                        } else {
                            var wrapper = {
                                answers: answers
                            };
                            res.status(200);
                            res.json(wrapper);
                            res.end();
                        }
                    });
                }
            });
        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

exports.all = [role.can('assign roles'), all];

// Create an answer and add it to a question.
var createAnswer = function (req, res) {
    var crisis_id = req.params.crisis_id;
    generic.get(req, req.models.Question, req.params.question_id, undefined, function (err, question) {
        if (!err && question) {
            //question exists
            generic.create(req.models.Answer, {
                type: req.body.type
            }, req, function (err, answer) {
                if (!err && answer) {
                    answer.setQuestion(question, function (err) {
                        if (!err) {
                            var link_string = '<a href="/crisis/'+crisis_id +'/question/' + answer.question_id +'/answer/'+answer.id+'">View evidence</a>.';
                            
                            var signupLinkString = '<a href="/register">Sign up</a>';
                            
                            var message = 'Thanks, your evidence has been posted! ' + link_string;
                            
                            if (req.user.type === 'provisional') {
                                message += '<br>You are currently posting as a guest as ' + req.user.name + '. ' + signupLinkString + ' to keep this content associated with your identity and earn reputation points on the platform.';
                            }
                            
                            req.flash('info', message);
                            res.redirect('/crisis/' + crisis_id +'/question/' + answer.question_id);
                            //res.json(wrapper);
                            res.end();
                        } else {
                            generic.genericErrorHandler(req, res, err);
                        }
                    });

                } else {
                    //special err: if 404 then it means the create just excuted is invalid.
                    res.status(500);
                    res.end('Error 500: Server Error');
                    console.r.error(req, 500, err);
                }
            });
        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

var checkRole = role.can('create an answer');

exports.create = [checkRole, createAnswer];



// Update answer
var update = function (req, res) {
    generic.get(req, req.models.Question, req.params.question_id, undefined, function (err, question) {
        if (!err && question) {
            generic.get(req, req.models.Answer, req.params.answer_id, undefined, function (err, answer) {
                if (!err && answer) {
                    generic.update(req.models.Answer, req.params.answer_id, req, function (err) {
                        if (!err) {
                            res.status(204);
                            res.end();
                        } else {
                            generic.genericErrorHandler(req, res, err);
                        }
                    });
                } else {
                    generic.genericErrorHandler(req, res, err);
                }
            });
        }
    });
};

exports.update = [role.can('edit an answer'), update];

// Remove an answer
var remove = function (req, res) {
    generic.get(req, req.models.Question, req.params.question_id, undefined, function (err, question) {
        if (!err && question) {
            generic.get(req, req.models.Answer, req.params.answer_id, undefined, function (err, answer) {
                if (!err && answer) {
                    answer.getComments(function (err, acomments) {
                        var j,
                            afterRemove = function (err) {
                                if (err) {
                                    generic.genericErrorHandler(req, res, err);
                                    throw err;
                                }
                            };
                        for (j in acomments) {
                            if (acomments.hasOwnProperty(j)) {
                                //start to delete acomments
                                generic.removeOne(acomments[j], req, afterRemove);
                            }
                        }
                        //start to delete answers
                        generic.removeOne(answer, req, function (err) {
                            if (!err) {
                                res.status(200);
                                // res.json(answer);
                                res.end();
                            } else {
                                generic.genericErrorHandler(req, res, err);
                                throw err;
                            }
                        });
                        // answers are deleted.
                    });
                } else {
                    generic.genericErrorHandler(req, res, err);
                }
            });
        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

exports.remove = [role.can('edit an answer'), remove];

var upvote = function (req, res) {
    generic.get(req, req.models.Answer, req.params.answer_id, undefined, function (err, answer) {
        if (!err && answer) {
            answer.getPost(function (err, post) {
                if (err) {
                    generic.genericErrorHandler(req, res, err);
                } else {
                    answer.post = post;
                    raiting_controller.upvote(req, answer.post, function(err, rating){
                        generic.load_answers_extra_fields(req, answer, function(){
                            if(!err){
                                res.status(200);
                                //Return answer for ajax update
                                res.json(answer);
                            } else {
                                generic.genericErrorHandler(req, res, err);
                            }
                        });
                    });   
                }
            });
                    
        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

exports.upvote = [role.can('upvote downvote'), upvote];

var downvote = function (req, res) {
    generic.get(req, req.models.Answer, req.params.answer_id, undefined, function (err, answer) {
        if (!err && answer) {
            answer.getPost(function(err, post){
                raiting_controller.downvote(req, answer.post, function(err, rating){
                    generic.load_answers_extra_fields(req, answer, function(){
                        if(!err){
                            res.status(200);
                            //Return answer for ajax update
                            res.json(answer);
                        } else {
                            generic.genericErrorHandler(req, res, err);
                        }
                    });
                });
            });
        } else {
            generic.genericErrorHandler(req, res, err);
        }
    });
};

exports.downvote = [role.can('upvote downvote'), downvote];

exports.getVideoHtml = function (req, res) {
    oembed.fetch(req.body.videoUrl, {}, function(err, result){

        if(!err){
            res.status(200);
            res.json(result);
        }else{
            res.status(200);
            res.json(err);
        }
    });
};