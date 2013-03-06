
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , fs = require('fs')
  , walkdir = require('walkdir')
  , io = require('socket.io')
  , fm = require('./plugins/filemanager/filemanager.js')
  , app_config = require("./app-config.json")

console.log(app_config)
/*declare app without var so that each module can access it*/
app = express()
app.set("config", app_config)

app.configure(function(){
  app.set('port', process.env.PORT || 9420)
  app.set('views', __dirname + '/views')
  app.set('view engine', 'ejs')
  app.use(express.favicon())
  app.use(express.logger('dev'))
  app.use(express.compress())
  app.use(express.bodyParser())
  app.use(express.methodOverride())
  app.use(express.cookieParser('your secret here'))
  app.use(express.cookieSession())
  app.use(app.router)
  app.use(require('stylus').middleware(__dirname + '/public'))
  app.use(express.static(path.join(__dirname, 'public')))

  // __dirname: the path of the direcotry that the currently executing script resides in.
  var package = require(path.resolve(__dirname, './package.json'))

  // Setup local variables to be available in the views.
  app.locals.title = "Online Markdown Editor - Dillinger, the Last Markdown Editor ever."
  app.locals.description = "Dillinger is an Online cloud based HTML5 filled Markdown Editor. Sync with Dropbox and Github. 100% Open Source!"
  app.locals.node_version = process.version.replace('v', '')
  app.locals.app_version = package.version
  app.locals.env = process.env.NODE_ENV
  app.locals.readme = fs.readFileSync( path.resolve(__dirname, './README.md'), 'utf-8')

  // Compress/concat files for deploy env...
  // Need to run this locally BEFORE deploying
  // to nodejitsu
  // $ NODE_ENV=predeploy node app
  if(app.locals.env === 'predeploy'){
    cleaner()
    setTimeout(smoosher,750)
  }

})

//[Background of app.configure]Conditionally invoke callback when
// env matches app.get('env'), aka process.env.NODE_ENV.
// This method remains for legacy reason, and is effectively an if statement
// as illustrated in the following snippets.
// if ('development' == app.get('env') {app.set(.....)}
// These functions are not required in order to use app.set() and other configuration methods.
app.configure('development', function(){
  app.use(express.errorHandler())
})

app.get('/', routes.index)

app.get('/not-implemented', routes.not_implemented)

/* Dillinger Actions */
// save a markdown file and send header to download it directly as response 
app.post('/factory/fetch_markdown', routes.fetch_md)

// Route to handle download of md file
app.get('/files/md/:mdid', routes.download_md)

// Save an html file and send header to download it directly as response 
app.post('/factory/fetch_html', routes.fetch_html)

// Route to handle download of html file
app.get('/files/html/:html', routes.download_html)


var server = http.createServer(app);
server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'))
  console.log("\nhttp://localhost:" + app.get('port') + "\n")
})

/**
 * Soket.io for real time connection
 */
var io = io.listen(server);
var froot = app.get('config')['file_root'];
io.set('log level', 1);
io.sockets.on('connection', function(socket){
  console.log('Client Connected');
  socket.on('request.file.data', function(id){
      var p = path.join(froot, id.substr(fm.id_prefix.length));
      var str = fs.readFileSync(p, 'utf8');
      socket.emit('open.file.data', str);
  });
  socket.on('request.save.file', function(data){
      var id = data['file_id'],
          content = data['content'];
      var p = path.join(froot, id.substr(fm.id_prefix.length));
      var res = fs.writeFileSync(p, content, 'utf8');
      socket.emit('save.file.msg', "successfully saved.");
  });
  socket.on('request.file.rename', function(data){
    var file = data['file'],
        new_title = data['nt'];

    var p = path.join(froot, file.id.substr(fm.id_prefix.length));
    var np = path.join(path.dirname(p), new_title + '.md');
    fs.exists(p,function(exists){
        if (!exists) emit(false, false);
        fs.rename(p, np, function (err) {
            if (err) {
                if (err) console.stack(err);
                emit(false, false);
            }
            //check the new path
            fs.stat(np, function (err, stats) {
                if (err) console.stack(err);
                console.log('stats: ' + JSON.stringify(stats));
                emit(true, fm.path_to_json(np, {'relative_root': froot}));
            });
        });
        //helper function for sending msg back
        function emit(success, data) {
            socket.emit('file.rename.msg', {
                'success': success ? true : false,
                'prev_id': file['id'], //the prev file id
                'data': data //new file data
            });
        }
    });

});

  socket.on('disconnect', function(){
    console.log('Client Disconnected.');
  });
});

/**
  Some helpers for deployment, cleaning up...
**/

// Pass in a path of a directory to walk and a 
// regex to match against.  The file(s) matching
// the patter will be deleted.
function walkAndUnlink(dirPath, regex){
  
  var emitter = walkdir(dirPath)

  emitter.on('file',function(filename,stat){
    if( regex.test(filename) ){
      console.log("Removing old file: " + filename)
      fs.unlinkSync( path.resolve( dirPath, filename) )
    }
  })
  
}

// Removes old css/js files.
function cleaner(){

  if(app.locals.env === 'predeploy'){
    walkAndUnlink( path.join(__dirname, 'public', 'css'), new RegExp(/style-/) )
    walkAndUnlink( path.join(__dirname, 'public', 'js'), new RegExp(/dependencies-/) )
    walkAndUnlink( path.join(__dirname, 'public', 'js'), new RegExp(/dillinger-/) )
  }
}

// Concats, minifies js and css for production
function smoosher(){

  // Compress/concat files for deploy env...
  // Need to run this locally BEFORE deploying
  // to nodejitsu
  require('smoosh').make({
    "VERSION": app.locals.app_version,
    "JSHINT_OPTS": {
      "browser": true,
      "evil":true, 
      "boss":true, 
      "asi": true, 
      "laxcomma": true, 
      "expr": true, 
      "lastsemic": true, 
      "laxbreak":true,
      "regexdash": true
    },
    "JAVASCRIPT": {
      "DIST_DIR": "./public/js",
      "dependencies": [ { "src": "./public/js/bootstrap.js", "jshint": false}, 
                        { "src": "./public/js/ace.js", "jshint": false}, 
                        { "src": "./public/js/keybinding-vim.js", "jshint": false}, 
                        { "src": "./public/js/mode-markdown.js", "jshint": false}, 
                        { "src": "./public/js/showdown.js", "jshint": false},
                        //对于highlight库，没有unpack的js文件
                        { "src": "./public/js/highlight.min.js", "jshint": false},
                        { "src": "./public/js/socket.io.js", "jshint": false},
                        { "src": "./public/js/filemanager.js", "jshint": false},
                        { "src": "./public/js/keymaster.js", "jshint": false}],
      "dillinger": [ "./public/js/dillinger.js" ]
    },
    "CSS": {
      "DIST_DIR": "./public/css",
      "style": [ "./public/css/style.css" ]
    }
  })
  .done(function(){
    console.log('\nSmoosh all finished...\n')
  })
  
}