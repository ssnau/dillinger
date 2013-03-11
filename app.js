
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
var froot = app.get('config')['file_root'];

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
  app.use(express.static(path.join(froot, '_img')))

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

app.get('/', function(req, res) {
    var conf = app.get('config');
    if (conf.user) {
        if (conf.user != '*' && conf.user == req.param('user')) {
            routes.index(req, res);
        } else {
            res.send('you are not authorized!')
        }
    } else {
        routes.index(req, res);
    }
})

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

// File
app.get('/files/create', function(req, res){
    var file = fm.createfile(froot, req.param('path'));
    res.send(JSON.stringify(file));
})

var server = http.createServer(app);
server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'))
  console.log("\nhttp://localhost:" + app.get('port') + "\n")
})

/**
 * Soket.io for real time connection
 */
var io = io.listen(server);
io.set('log level', 1);
io.sockets.on('connection', function(socket){
  console.log('Client Connected');
  socket.on('request.open.file', function(file){
      if (file && file.path);else return false;
      var p = path.join(froot, file.path);
      if (fs.existsSync(p)) {
        var str = fs.readFileSync(p, 'utf8');
        socket.emit('response.open.file', str);
      }
  });
  socket.on('request.save.file', function(data){
      var p = data['path'],
          content = data['content'];
      var p = path.join(froot, p);
      fs.writeFileSync(p, content, 'utf8');
      socket.emit('response.save.file', "successfully saved.");
  });
  socket.on('request.file.rename', function(data){
    var folder = data['folder'],
        file = data['file'],
        new_title = data['nt'],
        result = fm.renamefile(froot, file, new_title);

    if (result) {
        emit(true, result);
    } else {
        emit(false);
    }

    //helper function for sending msg back
    function emit(success, data) {
      socket.emit('file.rename.msg', {
          'success': success ? true : false,
          'prev_id': file['id'], //the prev file id
          'data': data //new file data
      });
    }
});

  socket.on('disconnect', function(){
    console.log('Client Disconnected.');
  });

    var search_task = null;
    /**
     * task should contain {
     * id: String,
     * pattern: String, indicating what we are looking for
     * fps: Array, each one store file to search
     */
  socket.on('request.search', function(task){
      var files = task.fps,
          id = task.id,
          pattern = task.pattern,
          cs = 1,// 1 stands for case sensitive, 0 stands for case insensitive
          what = 3; //1 stands for content, 2 stands for file name, 3 stands for all
      search_task = task;
      console.log('performing search ' + id +': ' + task.pattern);
      if (!pattern.length) return;
      if (pattern[0] === '#') {
          what = 2;
          pattern = pattern.substring(1);
      }
      if (pattern[0] === '!') { //means case sensitive
          cs = 1;
      }
      files.forEach(function(file) {
          var p = file.path;
          file.searchtask_id = id;
          if (search_task.id != id) {
              console.log('old ' + id + ' is not identical to the current one ' + search_task.id + ' !abort!');
              return false;
          }
          if (what == 2 || what == 3) {
              if (p.indexOf(pattern) != -1) {
                  emit(file);
                  return true;
              }
          }
          fs.readFile(path.join(froot, p), 'utf8', function(err, data){
            if (search_task.id != id) {
                console.log('old ' + id + ' is not identical to the current one ' + search_task.id + ' !abort!');
                return false;
            }
            if (cs) {
                data = data.toLowerCase();
                pattern = pattern.toLowerCase();
            }
            if (data.indexOf(pattern) != -1) {
                console.log('get file:' + file.path)
                emit(file);
            }
          })
      })
      function emit(res){
          socket.emit('response.search', res)
      }
  });

    /**
     * Dealing with image uploading
     */
    socket.on('request.send.file', function(name, buffer) {

        //path to store uploaded files (NOTE: presumed you have created the folders)
        var fileName = genFileName(),
            baseName = path.relative(path.join(froot, '_img'), fileName);

        fs.open(fileName, 'a', 0755, function(err, fd) {
            if (err) throw err;

            fs.write(fd, buffer, null, 'Binary', function(err, written, buff) {
                fs.close(fd, function() {
                    console.log('File saved successful!');
                    socket.emit('response.send.file', baseName)
                });
            })
        });

        function genFileName() {
            var time = (new Date() - 0).toString().substring(9),
                fileName = path.join(froot, '_img', [s4(),'-',s4(),'-', time, '.png'].join('') );
            if (fs.existsSync(fileName)){ //if already exist, re-generate it.
             return genFileName();
            }
            return fileName;
        }
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
function s4() {return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1) }
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