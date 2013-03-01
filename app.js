
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , fs = require('fs')
  , walkdir = require('walkdir')

var app = express()

app.configure(function(){
  app.set('port', process.env.PORT || 8080)
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

/* Begin Dropbox */

app.get('/oauth/dropbox', routes.oauth_dropbox)

app.get('/unlink/dropbox', routes.unlink_dropbox)

app.get('/import/dropbox', routes.import_dropbox)

// app.get('/account/dropbox', routes.account_info_dropbox)

app.post('/fetch/dropbox', routes.fetch_dropbox_file)

app.post('/save/dropbox', routes.save_dropbox)

/* End Dropbox */

/* Begin Github */

app.get('/oauth/github', routes.oauth_github)

app.get('/unlink/github', routes.unlink_github)

// app.get('/account/github', routes.account_info_github)

app.post('/import/github/repos', routes.import_github_repos)

app.post('/import/github/branches', routes.import_github_branches)

app.post('/import/github/tree_files', routes.import_tree_files)

app.post('/import/github/file', routes.import_github_file)

app.post('/save/github', routes.save_github)

/* End Github */



/* Dillinger Actions */
// save a markdown file and send header to download it directly as response 
app.post('/factory/fetch_markdown', routes.fetch_md)

// Route to handle download of md file
app.get('/files/md/:mdid', routes.download_md)

// Save an html file and send header to download it directly as response 
app.post('/factory/fetch_html', routes.fetch_html)

// Route to handle download of html file
app.get('/files/html/:html', routes.download_html)


http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'))
  console.log("\nhttp://localhost:" + app.get('port') + "\n")
})

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
      "regexdash": true,
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