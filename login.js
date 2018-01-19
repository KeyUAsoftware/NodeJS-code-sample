const express = require('express');
const apiGateway = require('../lib/apiGateway');
const unirest = require('@bigfinite/lambda-invoker');
const statusCodes = require('http-status-codes');
const helpers = require('./helpers/login-helper');

const router = express.Router();

const getPasswordExpirDateURL = `${global.site_url}/getPasswordExpirDate`;
const jsFiles = [
	{
		src: 'plugins/validate/jquery.validate.min.js',
	}, {
		src: 'plugins/sha256.js',
	}, {
		src: 'plugins/bootbox/bootbox.min.js',
	}, {
		src: 'loginform.js',
	}, {
		src: 'plugins/blockUI/jquery.blockUI.js',
	}
];

/* GET login page */
router.get('/', (req, res) => {
	const { redirectTo } = req.query;

	if (req.bigsession.credentials !== undefined && req.bigsession.credentials !== null) {
		if (redirectTo === undefined) return res.redirect(`${global.site_url}/home`);
		res.redirect(redirectTo);
	} else {
		res.render('login', {
			title: 'bigfinite | Login',
			layout: 'no-header',
			site_url: global.site_url,
			getPasswordExpirDateURL,
			duration: 0,
			monitoring: false,
			js: jsFiles,
			customer: req.bigsession.tempcustomer,
			credentials: req.bigsession.tempcredentials,
			redirectTo,
		});
	}
});

/* POST login post */
router.post('/', (req, res, next) => {
	const {
		credentials,
		customer,
		password,
	} = req.body;
	const samlResponse = req.body.SAMLResponse;

	let args = {};
	let url;
	let stream;

	if (samlResponse) {
		args = {
			samlResponse,
			credentials,
		};
		stream = unirest.post(apiGateway.urlEndpoint.areSAMLCredentialsOK).send(args);
	} else {
		args = {
			customer,
			credentials,
			password,
		};
		url = `${apiGateway.urlEndpoint.areCredentialsOK}?${serialize(args)}`;
		stream = unirest.get(url);
	}
	stream.end((response) => {
		if (response.status === statusCodes.OK) {
			const result = parseJSONP(response.raw_body);
			if (result.Result) {
				if (result.Result.ChallengeName === 'SMS_MFA') return helpers.startMFA(req, res, next, customer, result.Result);
				if (result.Result.ChallengeName === 'JWT') return helpers.startHome(req, res, next, result.Result.ID_CUSTOMER, result.Result.ID);
				if (result.Result.ChallengeName === 'SAML') return helpers.startHome(req, res, next, result.Result.ID_CUSTOMER, result.Result.ID);
				helpers.startHome(req, res, next, customer, credentials);
			} else helpers.loginError(req, res, next, customer, credentials);
		} else res.redirect(`${global.site_url}/?msg=8`);
	});
});

/* POST mfa post */
router.post('/mfa', (req, res, next) => {
	const {
		ID,
		mfaCode,
		session,
		customer,
	} = req.body;
	const args = {
		ID,
		mfaCode,
		session,
		customer,
	};
	const url = `${apiGateway.urlEndpoint.loginMFA}?${serialize(args)}`;

	unirest
		.get(url)
		.end((response) => {
			if (response.status === statusCodes.OK) {
				const result = parseJSONP(response.raw_body);
				if (result.Result) return helpers.startHome(req, res, next, customer, ID);
				res.redirect(`${global.site_url}/?msg=8`);
			} else res.redirect(`${global.site_url}/?msg=8`);
		});
});

/* show expiration date */
router.get('/getPasswordExpirDate', (req, res) => {
	const {
		credentials,
		customer,
		password,
	} = req.query;
	const args = {
		customer,
		credentials,
		password,
	};
	const urlExpir = `${apiGateway.urlEndpoint.getExpirationPsswd}?${serialize(args)}`;

	unirest
		.get(urlExpir)
		.end((response) => {
			if (response.status === statusCodes.OK) {
				const responseObj = parseJSONP(response.raw_body);
				const pars = JSON.parse(JSON.stringify(responseObj));
				res.json({
					data: pars.Result.expiration,
				});
			} else res.redirect(`${global.site_url}?msg=7`);
		});
});

/* GET redirect on logout */
router.get('/logout', (req, res) => {
	req.bigsession.destroy();
	res.redirect(`${global.site_url}/`);
});

module.exports = router;
