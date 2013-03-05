var path = require('path')
  , request = require('request')
  , qs = require('querystring')
  , Core = require( path.resolve(__dirname, '../plugins/core/core.js') ).Core
  , fm = require( path.resolve(__dirname, '../plugins/filemanager/filemanager.js'))

// Show the home page
exports.index = function(req, res){
    var file_tree = fm.folder_to_json(app.get("config")['file_root'], {
      'file_filter': /\.md$|txt$/
    });
    res.render('index', {
      'file_tree': JSON.stringify(file_tree)
    });
}

// Show the not implemented yet page
exports.not_implemented = function(req,res){
  res.render('not-implemented')
}

/* Core stuff */

exports.fetch_md = Core.fetchMd
exports.download_md = Core.downloadMd
exports.fetch_html = Core.fetchHtml
exports.download_html = Core.downloadHtml

/* End Core stuff */

