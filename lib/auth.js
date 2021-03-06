var nodemailer = require('nodemailer');

//Facebook authentication
exports.facebookAuth = {
		'clientID' 		: process.env.FACEBOOK_APP_ID || 'null',
		'clientSecret' 	: process.env.FACEBOOK_SECRET || 'null', 
		'callbackURL' 	: 'https://veri.ly/auth/facebook/callback'
};

//Twitter authentication
exports.twitterAuth = {
	'consumerKey' 		: process.env.TWITTER_KEY || 'null',
	'consumerSecret' 	: process.env.TWITTER_SECRET || 'null',
	'callbackURL' 		: 'https://veri.ly/auth/twitter/callback'
};

exports.admin = {
	'username': process.env.ADMIN_USERNAME || 'verily',
	'password': process.env.ADMIN_PASSWORD || '1234'
};

//SMTP setup
exports.mailer = nodemailer.createTransport('SMTP', {
    service: 'SendGrid',
    auth: {
        user: process.env.SENDGRID_USERNAME,
        pass: process.env.SENDGRID_PASSWORD
    }
});