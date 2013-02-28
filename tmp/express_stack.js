/**
 * Created with JetBrains WebStorm.
 * User: Administrator
 * Date: 3/1/13
 * Time: 1:52 AM
 * To change this template use File | Settings | File Templates.
 */
function query(req, res, next){
    if (!req.query) {
        req.query = ~req.url.indexOf('?')
            ? qs.parse(parse(req).query, options)
            : {};
    }

    next();
}
function expressInit(req, res, next){
    req.app = res.app = app;
    if (app.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');
    req.res = res;
    res.req = req;
    req.next = next;

    req.__proto__ = app.request;
    res.__proto__ = app.response;

    res.locals = res.locals || utils.locals(res);

    next();
}
function favicon(req, res, next){
    if ('/favicon.ico' == req.url) {
        if (icon) {
            res.writeHead(200, icon.headers);
            res.end(icon.body);
        } else {
            fs.readFile(path, function(err, buf){
                if (err) return next(err);
                icon = {
                    headers: {
                        'Content-Type': 'image/x-icon'
                        , 'Content-Length': buf.length
                        , 'ETag': '"' + utils.md5(buf) + '"'
                        , 'Cache-Control': 'public, max-age=' + (maxAge / 1000)
                    },
                    body: buf
                };
                res.writeHead(200, icon.headers);
                res.end(icon.body);
            });
        }
    } else {
        next();
    }
}
function logger(req, res, next) {
    req._startTime = new Date;

    // immediate
    if (immediate) {
        var line = fmt(exports, req, res);
        if (null == line) return;
        stream.write(line + '\n');
        // proxy end to output logging
    } else {
        var end = res.end;
        res.end = function(chunk, encoding){
            res.end = end;
            res.end(chunk, encoding);
            var line = fmt(exports, req, res);
            if (null == line) return;
            stream.write(line + '\n');
        };
    }


    next();
}
function (req, res, next){
    var accept = req.headers['accept-encoding']
        , write = res.write
        , end = res.end
        , stream
        , method;

    // vary
    res.setHeader('Vary', 'Accept-Encoding');

    // proxy

    res.write = function(chunk, encoding){
        if (!this.headerSent) this._implicitHeader();
        return stream
            ? stream.write(new Buffer(chunk, encoding))
            : write.call(res, chunk, encoding);
    };

    res.end = function(chunk, encoding){
        if (chunk) this.write(chunk, encoding);
        return stream
            ? stream.end()
            : end.call(res);
    };

    res.on('header', function(){
        var encoding = res.getHeader('Content-Encoding') || 'identity';

        // already encoded
        if ('identity' != encoding) return;

        // default request filter
        if (!filter(req, res)) return;

        // SHOULD use identity
        if (!accept) return;

        // head
        if ('HEAD' == req.method) return;

        // default to gzip
        if ('*' == accept.trim()) method = 'gzip';

        // compression method
        if (!method) {
            for (var i = 0, len = names.length; i < len; ++i) {
                if (~accept.indexOf(names[i])) {
                    method = names[i];
                    break;
                }
            }
        }

        // compression method
        if (!method) return;

        // compression stream
        stream = exports.methods[method](options);

        // header fields
        res.setHeader('Content-Encoding', method);
        res.removeHeader('Content-Length');

        // compression

        stream.on('data', function(chunk){
            write.call(res, chunk);
        });

        stream.on('end', function(){
            end.call(res);
        });

        stream.on('drain', function() {
            res.emit('drain');
        });
    });

    next();
}
function bodyParser(req, res, next) {
    _json(req, res, function(err){
        if (err) return next(err);
        _urlencoded(req, res, function(err){
            if (err) return next(err);
            _multipart(req, res, next);
        });
    });
}
function methodOverride(req, res, next) {
    req.originalMethod = req.originalMethod || req.method;

    // req.body
    if (req.body && key in req.body) {
        req.method = req.body[key].toUpperCase();
        delete req.body[key];
        // check X-HTTP-Method-Override
    } else if (req.headers['x-http-method-override']) {
        req.method = req.headers['x-http-method-override'].toUpperCase();
    }

    next();
}
function cookieParser(req, res, next) {
    if (req.cookies) return next();
    var cookies = req.headers.cookie;

    req.secret = secret;
    req.cookies = {};
    req.signedCookies = {};

    if (cookies) {
        try {
            req.cookies = cookie.parse(cookies);
            if (secret) {
                req.signedCookies = utils.parseSignedCookies(req.cookies, secret);
                req.signedCookies = utils.parseJSONCookies(req.signedCookies);
            }
            req.cookies = utils.parseJSONCookies(req.cookies);
        } catch (err) {
            err.status = 400;
            return next(err);
        }
    }
    next();
}
function cookieSession(req, res, next) {

    // req.secret is for backwards compatibility
    var secret = options.secret || req.secret;
    if (!secret) throw new Error('`secret` option required for cookie sessions');

    // default session
    req.session = {};
    var cookie = req.session.cookie = new Cookie(options.cookie);

    // pathname mismatch
    if (0 != req.originalUrl.indexOf(cookie.path)) return next();

    // cookieParser secret
    if (!options.secret && req.secret) {
        req.session = req.signedCookies[key] || {};
    } else {
        // TODO: refactor
        var rawCookie = req.cookies[key];
        if (rawCookie) {
            var unsigned = utils.parseSignedCookie(rawCookie, secret);
            if (unsigned) {
                var originalHash = crc32.signed(unsigned);
                req.session = utils.parseJSONCookie(unsigned) || {};
            }
        }
    }

    res.on('header', function(){
        // removed
        if (!req.session) {
            debug('clear session');
            cookie.expires = new Date(0);
            res.setHeader('Set-Cookie', cookie.serialize(key, ''));
            return;
        }

        delete req.session.cookie;

        // check security
        var proto = (req.headers['x-forwarded-proto'] || '').toLowerCase()
            , tls = req.connection.encrypted || (trustProxy && 'https' == proto)
            , secured = cookie.secure && tls;

        // only send secure cookies via https
        if (cookie.secure && !secured) return debug('not secured');

        // serialize
        debug('serializing %j', req.session);
        var val = 'j:' + JSON.stringify(req.session);

        // compare hashes, no need to set-cookie if unchanged
        if (originalHash == crc32.signed(val)) return debug('unmodified session');

        // set-cookie
        val = 's:' + signature.sign(val, secret);
        val = cookie.serialize(key, val);
        debug('set-cookie %j', cookie);
        res.setHeader('Set-Cookie', val);
    });

    next();
}
function router(req, res, next){
    self._dispatch(req, res, next);
}
function stylus(req, res, next){
    if ('GET' != req.method && 'HEAD' != req.method) return next();
    var path = url.parse(req.url).pathname;
    if (/\.css$/.test(path)) {
        var cssPath = join(dest, path)
            , stylusPath = join(src, path.replace('.css', '.styl'));

        // Ignore ENOENT to fall through as 404
        function error(err) {
            next('ENOENT' == err.code
                ? null
                : err);
        }

        // Force
        if (force) return compile();

        // Compile to cssPath
        function compile() {
            debug('read %s', cssPath);
            fs.readFile(stylusPath, 'utf8', function(err, str){
                if (err) return error(err);
                var style = options.compile(str, stylusPath);
                var paths = style.options._imports = [];
                delete imports[stylusPath];
                style.render(function(err, css){
                    if (err) return next(err);
                    debug('render %s', stylusPath);
                    imports[stylusPath] = paths;
                    mkdirp(dirname(cssPath), 0700, function(err){
                        if (err) return error(err);
                        fs.writeFile(cssPath, css, 'utf8', next);
                    });
                });
            });
        }

        // Re-compile on server restart, disregarding
        // mtimes since we need to map imports
        if (!imports[stylusPath]) return compile();

        // Compare mtimes
        fs.stat(stylusPath, function(err, stylusStats){
            if (err) return error(err);
            fs.stat(cssPath, function(err, cssStats){
                // CSS has not been compiled, compile it!
                if (err) {
                    if ('ENOENT' == err.code) {
                        debug('not found %s', cssPath);
                        compile();
                    } else {
                        next(err);
                    }
                } else {
                    // Source has changed, compile it
                    if (stylusStats.mtime > cssStats.mtime) {
                        debug('modified %s', cssPath);
                        compile();
                        // Already compiled, check imports
                    } else {
                        checkImports(stylusPath, function(changed){
                            if (debug && changed.length) {
                                changed.forEach(function(path) {
                                    debug('modified import %s', path);
                                });
                            }
                            changed.length ? compile() : next();
                        });
                    }
                }
            });
        });
    } else {
        next();
    }
}
function static(req, res, next) {
    if ('GET' != req.method && 'HEAD' != req.method) return next();
    var path = parse(req).pathname;
    var pause = utils.pause(req);

    function resume() {
        next();
        pause.resume();
    }

    function directory() {
        if (!redirect) return resume();
        var pathname = url.parse(req.originalUrl).pathname;
        res.statusCode = 301;
        res.setHeader('Location', pathname + '/');
        res.end('Redirecting to ' + utils.escape(pathname) + '/');
    }

    function error(err) {
        if (404 == err.status) return resume();
        next(err);
    }

    send(req, path)
        .maxage(options.maxAge || 0)
        .root(root)
        .hidden(options.hidden)
        .on('error', error)
        .on('directory', directory)
        .pipe(res);
}
function errorHandler(err, req, res, next){
    if (err.status) res.statusCode = err.status;
    if (res.statusCode < 400) res.statusCode = 500;
    if ('test' != env) console.error(err.stack);
    var accept = req.headers.accept || '';
    // html
    if (~accept.indexOf('html')) {
        fs.readFile(__dirname + '/../public/style.css', 'utf8', function(e, style){
            fs.readFile(__dirname + '/../public/error.html', 'utf8', function(e, html){
                var stack = (err.stack || '')
                    .split('\n').slice(1)
                    .map(function(v){ return '<li>' + v + '</li>'; }).join('');
                html = html
                    .replace('{style}', style)
                    .replace('{stack}', stack)
                    .replace('{title}', exports.title)
                    .replace('{statusCode}', res.statusCode)
                    .replace(/\{error\}/g, utils.escape(err.toString()));
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(html);
            });
        });
        // json
    } else if (~accept.indexOf('json')) {
        var error = { message: err.message, stack: err.stack };
        for (var prop in err) error[prop] = err[prop];
        var json = JSON.stringify({ error: error });
        res.setHeader('Content-Type', 'application/json');
        res.end(json);
        // plain text
    } else {
        res.writeHead(res.statusCode, { 'Content-Type': 'text/plain' });
        res.end(err.stack);
    }
}