global.__base = `${__dirname  }/`;
global.site_url = process.env.SITE_URL !== undefined ? process.env.SITE_URL : 'http://bigfinite.local:3000';

const express = require('express');
const i18next = require('i18next');
const Backend = require('i18next-node-fs-backend');
const moment = require('moment');
const requestId = require('request-id/express');
const cors = require('cors');
const unirest = require('@bigfinite/lambda-invoker');

const cognitoDomain = process.env.COGNITO_CUSTOM_DOMAIN;
const cognitoRegion = process.env.AWS_REGION;
const cognitoClientId = process.env.APP_CLIENT_COGNITO_ID;
const redirectUri = process.env.COGNITO_REDIRECT_URI;

const i18nextOptions = {
  debug: false,
  lng: 'en',
  fallbackLng: 'en',
  preload: ['en'],
  load: 'current',
  saveMissing: true,
  backend: {
    loadPath: './public/locales/{{lng}}/translation.json',
    addPath: './public/locales/{{lng}}/translation.missing.json',
    jsonIndent: 2,
  },
};

i18next.use(Backend).init(i18nextOptions);

const session = require('client-sessions');
const expressHandlebars = require('express-handlebars');
const path = require('path');
const favicon = require('serve-favicon');
const pino = require('express-pino-logger')();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const consts = require('./lib/constants');
const apiGateway = require('./lib/apiGateway');

/*
=======================================
ROUTES DECLARATION
=======================================
*/

const login = require('./routes/login');
const home = require('./routes/home');
const signup = require('./routes/signup');
const forgot = require('./routes/forgot');
const locales = require('./routes/locales');
const authorize = require('./routes/authorize');
const redirect = require('./routes/redirect');

/* Master Data routes */
const data = require('./routes/data');
const users = require('./routes/master-data/users');
const devices = require('./routes/master-data/devices');
const elements = require('./routes/master-data/elements');
const emailaccounts = require('./routes/master-data/emailaccounts');
const virtualentities = require('./routes/master-data/virtualentities');
const agents = require('./routes/master-data/agents');
const associations = require('./routes/master-data/associations');
const processes = require('./routes/master-data/processes');
const processInstances = require('./routes/master-data/process-instances');
const views = require('./routes/master-data/views');
const scenarios = require('./routes/master-data/scenarios');
const bebrowser = require('./routes/master-data/bebrowser');
const valueassociations = require('./routes/master-data/valueassociations');
const bedatafeeders = require('./routes/master-data/bedatafeeders');
const dataupload = require('./routes/master-data/dataupload');
const templates = require('./routes/master-data/templates');
const masterDataSolutions = require('./routes/master-data/solutions');
const masterDataSolutionsDesign = require('./routes/master-data/solutions-design');
const schema = require('./routes/schema');

/* Static research routes */
const predictions = require('./routes/static-research/predictions');
const multivariate = require('./routes/static-research/multivariate');
const relations = require('./routes/relationsdiscovery');

/* Advanced research routes */
const datacomparison = require('./routes/advanced-research/datacomparison');
const processCharacterization = require('./routes/advanced-research/process-characterization');

/* Regulatory routes */
const useraccess = require('./routes/regulatory/useraccess');
const suspiciousaccess = require('./routes/regulatory/suspiciousaccess');
const changecontrol = require('./routes/regulatory/changecontrol');
const audit = require('./routes/regulatory/audit');
const profiles = require('./routes/regulatory/profiles');
const tests = require('./routes/regulatory/tests');
const rawdatadownload = require('./routes/regulatory/rawdata');

/* Administration */
const apicalladmin = require('./routes/administration/apicalladmin');

/* Be Discovery */
const bediscovery = require('./routes/bediscovery');
/* Be Query */
const bequery = require('./routes/bequery');
/* Solutions */
const solutions = require('./routes/solutions');
/* ELB check */
const elbcheck = require('./routes/elbcheck');
/* session keep alive */
const keepAlive = require('./routes/keep-alive');
/* Signature for critical changes */
const certify = require('./routes/certify');
/* clipboard */
const clipboardRoute = require('./routes/clipboard');
const v1 = require('./routes/api/v1');

const app = express();

app.use(requestId());
app.use(cors());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('handlebars', expressHandlebars({
  defaultLayout: 'main',
  helpers: {
    __: message => (i18next.t(message)),
    ifCond: (v1, operator, v2, options) => {
      switch (operator) {
        case '==':
          return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
          return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
          return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
          return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
          return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
          return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
          return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
          return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
          return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
          return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
          return options.inverse(this);
      }
    },
    moment: (context) => (moment(context).toISOString()),
    round: (context) => {
      if (isNaN(context)) {
        return context;
      }
      return Math.round(context * 100) / 100;
    },
    session: () => {},
    json: (context) => {
      if (context) {
        return JSON.stringify(context);
      }
      return 'null';
    },
    encodeURIComponent: (context) => encodeURIComponent(context),
    json_string: (context) => {
      if (context) {
        return JSON.stringify(context);
      }
      return '';
    },
    stringify: (context) => {
      if (context) {
        if (typeof context === 'object') {
          return JSON.stringify(context);
        }
        return context;
      }
      return '';
    },
    integer: context => (parseInt(context, 10)),
    icon: (type) => {
      switch (parseInt(type)) {
        case consts.TYPE_USER:
          return 'fa fa-user';
        case consts.TYPE_SITE_ELEMENT:
          return 'fa fa-cloud';
        case consts.TYPE_DEVICE:
          return 'fa fa-cube';
        case consts.TYPE_PROCESS:
          return 'fa fa-bars';
        case consts.TYPE_VIEW:
          return 'fa fa-chain';
        case consts.TYPE_AUDIT:
          return '';
        case consts.TYPE_SCENARIO:
          return 'fa fa-th';
        case consts.TYPE_USER_SCENARIO:
          return '';
        case consts.TYPE_ASSOCIATION:
          return 'fa fa-sitemap';
        case consts.TYPE_PROCESS_INSTANCE:
          return 'fa fa-clock-o';
        default:
          return '';
      }
    },
  },
}));

app.set('view engine', 'handlebars');

app.enable('trust proxy');

app.use(favicon(`${__dirname}/public/img/favicon.png`));

app.use(pino);

app.use(bodyParser.json({
  limit: '50mb',
}));
app.use(bodyParser.urlencoded({
  extended: false,
  limit: '50mb',
}));

app.use(cookieParser());

app.use(session({
  cookieName: 'bigsession',
  secret: '4OaPdqwfuhZRRmdJesZLUBkrgA5574x4nYesG7Va',
  duration: 30 * 60 * 1000, // how long the session will stay valid in ms
  activeDuration: 1000 * 60 * 30,
  secure: true,
}));

app.use(express.static(path.join(__dirname, 'public')));

/*
=======================================
ROUTES REGISTRATION
=======================================
*/
app.use((req, res, next) => {
  res.locals.msgAddOk = req.query.msg == 1;
  res.locals.msgAddFail = req.query.msg == 2;
  res.locals.msgEditOk = req.query.msg == 3;
  res.locals.msgEditFail = req.query.msg == 4;
  res.locals.msgDeleteOk = req.query.msg == 5;
  res.locals.msgDeleteFail = req.query.msg == 6;
  res.locals.msgExpiredPassword = req.query.msg == 7;
  res.locals.msgIncorrectPassword = req.query.msg == 8;
  res.locals.msgNotLoggedIn = req.query.msg == 9;
  res.locals.msgForgotSubmitted = req.query.msg == 10;
  res.locals.msgForgotSubmittedNotOk = req.query.msg == 11;
  res.locals.msgPwdChangeOk = req.query.msg == 12;
  res.locals.msgPwdChangeNotOk = req.query.msg == 13;
  res.locals.msgExpiredPasswordRequestNew = req.query.msg == 14;
  res.locals.msgNoProfile = req.query.msg == 15;
  res.locals.help_url = process.env.HELP_URL || 'https://help.bigengine.io';
  next();
});

app.use('/', login);
app.use('/authorize', authorize);
app.use('/signup', signup);
app.use('/forgot', forgot);
app.use('/elbcheck', elbcheck);
app.use('/keep-alive', keepAlive);
app.use('/api/v1', v1);

// methods that requires login
app.use((req, res, next) => {
  res.locals.version = apiGateway.urlEndpoint.version;
  if (req.bigsession.credentials === undefined || req.bigsession.credentials === null) {
    res.redirect(`${global.site_url}?msg=9&redirectTo=${req.originalUrl}`);
  } else {
    res.locals.credentials = req.bigsession.credentials;
    res.locals.customer = req.bigsession.customer;
    res.locals.permissions = req.bigsession.permissions;
    res.locals.region = req.bigsession.region;
    res.locals.userImage = req.bigsession.userImage;
    res.locals.isAjax = req.query.ajax == 'true';
    res.locals.layout = res.locals.isAjax ? 'clear' : 'main';
    res.locals.site_url = global.site_url;
    res.locals.beDiscoveryURL = `${global.site_url}/bediscovery`;
    res.locals.saveClipboardURL = `${global.site_url}/clipboard/save`;
    res.locals.beQueryURL = `${global.site_url}/bequery`;
    res.locals.evaluateExpressionURL = `${global.site_url}/data/evaluateExpression`;
    res.locals.keepAliveURL = `${global.site_url}/keep-alive`;
    res.locals.duration = req.bigsession.duration || 1200;
    res.locals.monitoring = req.bigsession.monitoring || false;
    res.locals.defaultStartDate = moment().add(-1, 'day').utc().startOf('day').toISOString();
    res.locals.defaultEndDate = moment().add(-1, 'day').utc().endOf('day').toISOString();

    const args = {
      customer: req.bigsession.customer,
      credentials: req.bigsession.credentials,
      ID: req.bigsession.credentials,
    };
    const isAjaxRequest = req.xhr;
    if (isAjaxRequest) {
      next();
    } else {
      const urlClipboard = `${apiGateway.urlEndpoint.getClipboard}?${serialize(args)}`;
      unirest
        .get(urlClipboard)
        .end((response) => {
          if (response.status === 200) {
            const {
              Result: clipboard
            } = parseJSONP(response.raw_body);
            res.locals.clipboard = clipboard;
          }
          next();
        });
    }
  }
});

app.use('/home', home);
app.use('/locales', locales);
app.use('/redirect', redirect);
app.use('/clipboard', clipboardRoute);
app.use('/data', data);
app.use('/masterdata/users', users);
app.use('/masterdata/devices', devices);
app.use('/masterdata/elements', elements);
app.use('/masterdata/emailaccounts', emailaccounts);
app.use('/masterdata/virtualentities', virtualentities);
app.use('/masterdata/agents', agents);
app.use('/masterdata/associations', associations);
app.use('/masterdata/processes', processes);
app.use('/masterdata/process-instances', processInstances);
app.use('/masterdata/views', views);
app.use('/masterdata/scenarios', scenarios);
app.use('/masterdata/bedatafeeders', bedatafeeders);
app.use('/masterdata/dataupload', dataupload);
app.use('/masterdata/valueassociations', valueassociations);
app.use('/static-research/predictions', predictions);
app.use('/masterdata/templates', templates);
app.use('/masterdata/solutions', masterDataSolutions);
app.use('/masterdata/solutions-design', masterDataSolutionsDesign);
app.use('/static-research/multivariate', multivariate);
app.use('/relationsdiscovery', relations);
app.use('/advanced-research/datacomparison', datacomparison);
app.use('/advanced-research/process-characterization', processCharacterization);
app.use('/beBrowser', bebrowser);
app.use('/schema', schema);
app.use('/regulatory/activity-trace', suspiciousaccess);
app.use('/regulatory/user-access', useraccess);
app.use('/regulatory/change-control', changecontrol);
app.use('/regulatory/audit', audit);
app.use('/regulatory/profiles', profiles);
app.use('/regulatory/tests', tests);
app.use('/regulatory/rawdatadownload', rawdatadownload);
app.use('/administration/apicalladmin', apicalladmin);
app.use('/solutions', solutions);
app.use('/certify', certify);
app.use('/bequery', bequery);
app.use('/bediscovery', bediscovery);

// catch 404 and forward to error handler
app.use((req, res) => {
  const err = new Error('Not Found');
  err.status = 404;
  res.status(404);
  res.render('404', {
    site_url: global.site_url,
    layout: false,
  });
});

// error handlers
app.use((err, req, res) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// development error handler
if (app.get('env') === 'development') {
  app.use((err, req, res) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      layout: 'error',
      error: err,
    });
  });
}

// production error handler
app.use((err, req, res) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    layout: 'error',
    error: {},
  });
});

const port = process.env.PORT || 3000;
const server = app.listen(port);

const host = server.address().address;
console.log('bigfinite UI listening at http://%s:%s', host, port);
console.log(`Site URL: ${global.site_url}`);

module.exports = app;
