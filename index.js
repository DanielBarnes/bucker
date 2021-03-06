var path = require('path'),
    util = require('util'),
    moment = require('moment'),
    Console = require('./lib/console'),
    File = require('./lib/file'),
    Syslog = require('./lib/syslog'),
    types = ['console', 'file', 'syslog'],
    levels = {
    debug: { num: 0, color: 'blue' },
    info: { num: 1, color: 'green' },
    warn: { num: 2, color: 'yellow' },
    error: { num: 3, color: 'red' },
    exception: { num: 4, color: 'red' },
    reverse: ['debug', 'info', 'warn', 'error', 'exception']
};

var Bucker = function (opts, mod) {
    var self = this,
        file,
        host;

    self.options = {};
    self.files = {};
    self.syslog = {};
    self.console = {};
    self.handlers = { access: {}, debug: {}, info: {}, warn: {}, error: {}, exception: {} };
    self.loggers = [];
    self.name = '';

    if (typeof opts === 'undefined') opts = {};

    self.handleExceptions = opts.hasOwnProperty('handleExceptions') ? opts.handleExceptions : false;

    if (opts.hasOwnProperty('level')) {
        if (typeof opts.level === 'string') {
            if (levels.hasOwnProperty(opts.level)) self.level = levels[opts.level];
        } else if (typeof opts.level === 'number') {
            if (opts.level <= 3 && opts.level >= 0) self.level = opts.level;
        }
    }
    if (!self.hasOwnProperty('level')) self.level = 0;

    if (opts.hasOwnProperty('name') || (mod && mod.filename)) self.name = opts.name || path.basename(mod.filename, '.js');

    if (opts.hasOwnProperty('app')) {
        self._setDefaultHandler(opts.app, 'file');
    } else {
        self._setDefaultHandler(false, 'file');
    }

    if (opts.hasOwnProperty('console')) {
        self._setDefaultHandler(opts.console, 'console');
    } else {
        self._setDefaultHandler(true, 'console');
    }

    if (opts.hasOwnProperty('syslog')) {
        self._setDefaultHandler(opts.syslog, 'syslog');
    } else {
        self._setDefaultHandler(false, 'syslog');
    }

    if (opts.hasOwnProperty('access')) self._setHandler(opts.access, 'access');
    if (opts.hasOwnProperty('debug')) self._setHandler(opts.debug, 'debug');
    if (opts.hasOwnProperty('info')) self._setHandler(opts.info, 'info');
    if (opts.hasOwnProperty('warn')) self._setHandler(opts.warn, 'warn');
    if (opts.hasOwnProperty('error')) {
        self._setHandler(opts.error, 'error');
        self._setHandler(opts.error, 'exception');
    }

    if (self.handleExceptions) {
        process.on('uncaughtException', function (err) {
            self.exception(err);
            process.exit(1);
        });
    }
};

Bucker.prototype._setDefaultHandler = function (options, type) {
    var self = this,
        handler,
        hash,
        loglevels = levels.reverse.concat(['access']);

    if (options === false) {
        handler = false;
    } else {
        if (type === 'file') {
            hash = typeof options === 'string' ? options : JSON.stringify(options);
            self.files[hash] = self.loggers.push(File(options, options.name || self.name)) - 1;
            handler = self.files[hash];
        } else if (type === 'console') {
            hash = typeof options === 'boolean' ? options.toString() : JSON.stringify(options);
            self.console[hash] = self.loggers.push(Console(options, options.name || self.name)) - 1;
            handler = self.console[hash];
        } else if (type === 'syslog') {
            hash = typeof options === 'string' ? options : JSON.stringify(options);
            self.syslog[hash] = self.loggers.push(Syslog(options, options.name || self.name)) - 1;
            handler = self.syslog[hash];
        }
    }
    loglevels.forEach(function (level) {
        self.handlers[level][type] = handler;
    });
};

Bucker.prototype._setHandler = function (options, level) {
    var self = this,
        hash;

    if (options === false) self.handlers[level] = false;

    if (typeof options === 'string') {
        hash = path.resolve(options);
        if (!self.files.hasOwnProperty(hash)) self.files[hash] = self.loggers.push(File(options, self.name)) - 1;
        self.handlers[level].file = self.files[hash];
    } else {
        if (options.hasOwnProperty('file')) {
            if (options.file === false) {
                self.handlers[level].file = false;
            } else {
                hash = path.resolve(typeof options.file === 'string' ? options.file : JSON.stringify(options.file));
                if (!self.files.hasOwnProperty(hash)) self.files[hash] = self.loggers.push(File(options.file, options.file.name || self.name)) - 1;
                self.handlers[level].file = self.files[hash];
            }
        }
        if (options.hasOwnProperty('console')) {
            if (options.console === false) {
                self.handlers[level].console = false;
            } else {
                hash = typeof options.console === 'boolean' ? options.console.toString() : JSON.stringify(options.console);
                if (!self.console.hasOwnProperty(hash)) self.console[hash] = self.loggers.push(Console(options.console, options.console.name || self.name)) - 1;
                self.handlers[level].console = self.console[hash];
            }
        }
        if (options.hasOwnProperty('syslog')) {
            if (options.syslog === false) {
                self.handlers[level].syslog = false;
            } else {
                hash = typeof options.syslog === 'string' ? options.syslog : JSON.stringify(options.syslog);
                if (!self.syslog.hasOwnProperty(hash)) self.syslog[hash] = self.loggers.push(Syslog(options.syslog, options.syslog.name || self.name)) - 1;
                self.handlers[level].syslog = self.syslog[hash];
            }
        }
    }
};

Bucker.prototype._findHandler = function (level, type) {
    return this.loggers[this.handlers[level][type]];
};

Bucker.prototype._runHandlers = function (level, data) {
    var self = this,
        handler;

    if (levels[level].num < self.level) return;
    types.forEach(function (type) {
        handler = self._findHandler(level, type);
        if (handler) handler.log(moment(), level, data);
    });
};

Bucker.prototype.exception = function (err) {
    var self = this,
        handler;

    types.forEach(function (type) {
        handler = self._findHandler('exception', type);
        if (handler) handler.exception(moment(), err);
    });
};

Bucker.prototype.debug = function () {
    this._runHandlers('debug', util.format.apply(this, arguments));
};

Bucker.prototype.log = Bucker.prototype.info = function () {
    this._runHandlers('info', util.format.apply(this, arguments));
};

Bucker.prototype.warn = function () {
    this._runHandlers('warn', util.format.apply(this, arguments));
};

Bucker.prototype.error = function () {
    this._runHandlers('error', util.format.apply(this, arguments));
};

Bucker.prototype.access = function (data) {
    var self = this,
        handler;

    data.time = moment(data.time);
    types.forEach(function (type) {
        handler = self._findHandler('access', type);
        if (handler) handler.access(data);
    });
};

Bucker.prototype.middleware = function () {
    var self = this;
    return function (req, res, next) {
        var access = {
            remote_ip: req.ip || req.socket.remoteAddress || req.socket.socket.remoteAddress,
            time: new Date(),
            method: req.method,
            url: req.originalUrl || req.url,
            http_ver: req.httpVersion,
            referer: req.headers.referer || req.headers.referrer || '-',
            agent: req.headers['user-agent'],
            length: 0,
            status: 0,
            response_time: Date.now()
        };
        var end = res.end;
        res.end = function (chunk, encoding) {
            access.response_time = String(Date.now() - access.response_time) + "ms";
            res.end = end;
            res.end(chunk, encoding);
            access.length = res._headers['content-length'] || 0;
            access.status = res.statusCode;
            self.access(access);
        };
        next();
    };
};

Bucker.prototype.errorHandler = function (opts) {
    var self = this;
    return function (err, req, res, next) {
        self.exception(err);
        return next(err);
    };
};

// Hapi plugin
exports.register = function (plugin, options, next) {
    // get/make bucker object
    var bucker;
    if (options instanceof Bucker) {
        bucker = options;
        options = bucker.options;
    } else {
        bucker = new Bucker(options);
    }
    // access logger
    plugin.events.on('response', function (req) {
        var access = {
            remote_ip: req.info.remoteAddress,
            time: new Date(),
            method: req.method.toUpperCase(),
            url: req.url.path,
            http_ver: req.raw.req.httpVersion,
            referer: req.raw.req.headers.referer || req.raw.req.headers.referrer || '-',
            agent: req.raw.req.headers['user-agent'],
            length: req._response._headers['Content-Length'],
            status: req._response._code,
            response_time: new Date().getTime() - req.info.received + 'ms'
        };
        bucker.access(access);
    });
    // add listener by default but dont if its false
    if (!options.hapi || (options.hapi && options.hapi.handleLog)) {
        plugin.events.on('log', function (event, tags) {
            var level;
            var data = '';
            // this is done intentionally so if multiple levels
            // are declared, the one with highest priority will be used
            if (tags.debug) level = 'debug';
            if (tags.info) level = 'info';
            if (tags.warn) level = 'warn';
            if (tags.error) level = 'error';
            if (!level) level = 'info';
            event.tags = event.tags.filter(function (tag) {
                return !~['error', 'warn', 'info', 'debug'].indexOf(tag);
            });
            if (event.tags.length) data = '[' + event.tags.join(', ') + '] ';
            data += util.format(event.data);
            bucker[level](data);
        });
    }
    return next();
};

exports.createLogger = function (options, mod) {
    return new Bucker(options, mod);
};
