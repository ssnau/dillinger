var fs = require('fs'),
    Path = require("path"),
    id_prefix = 'fm-';

/**
 * need an absolute path
 * @param  {[type]} root [description]
 * @return {[type]}      [description]
 */
function traverseFolder(root, config) {
    // enum for type
    var T_FOLDER = 1,
        T_FILE = 2;

    // TODO: use a mixin function
    config = config || {
        'file_filter': /.*/ //if RegExp matche, we keep this file tracked. Otherwise, leave it out.
    }
    if (!exists(root)) {
        console.log("root["+ root +"] is not found!");
        return false;
    }

    //start traversing
    return traverse(root);

    function traverse(path) {
    	var data = {};
        console.log("looking " + path);
        if (!exists(path)) {
            console.log("path not found!");
            return;
        }

        var baseName = Path.basename(path);

    	data = {
    		'id': id_prefix + Path.relative(root, path),
    		'name': baseName
    	}

        if (isDir(path)) {
        	data.type = T_FOLDER;
        	data.children = [];
            var subPaths = fs.readdirSync(path);
            subPaths.forEach(function (v) {
                var res = traverse(Path.resolve(path, v));
                res && data['children'].push(res);
            });
        }

        if (isFile(path)) {
            if (config.file_filter && config.file_filter.test(baseName)) {
                data.type = T_FILE;
            } else {
                return null;
            }
        	//TODO:
        }

        return data;
    }

    function isDir(path) {
        return fs.lstatSync(path).isDirectory();
    }

    function isFile(path) {
        return fs.lstatSync(path).isFile();
    }

    function exists(path) {
        return fs.existsSync(path)
    }

}

function guid() {
	function s4() {return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1) }
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	     s4() + '-' + s4() + s4() + s4();
}

exports.folder_to_json = traverseFolder;
exports.id_prefix = id_prefix;