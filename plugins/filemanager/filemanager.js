var fs = require('fs'),
    Path = require("path"),
    util = require('util');
/**
 *
 * @param folder Object
 * @param file Object
 * @param nt String
 * @returns {boolean}
 */
exports.renamefile = function renamefile(root, file, nt) {
    console.log('call renamefile');
    // if the path is empty, stop to rename, otherwise it will rename the root path!
    if (!file.path.length) {
        return false;
    }

    var p = Path.join(root, file.path);
    var np = Path.join(Path.dirname(p), nt + '.md');
    if (fs.existsSync(p)) {
        fs.renameSync(p, np);
        if (fs.existsSync(np)) {
            return traverseFolder(np, {'relative_root': root}); //only here we success
        } else {
            return false;
        }
    }
}

exports.createfile = function createfile(root, path) {
    var abs_folder = Path.join(root, path), file_path;
    for (var i = 1; i < 10; i++) {
        file_path = Path.join(abs_folder, 'Untitled ' + i + '.md');
        if (!fs.existsSync(file_path)) break;
    }
    try {
        fs.writeFileSync(file_path, "", "utf8");
    } catch(e) {
        console.log(e);
    }
    return traverseFolder(file_path,{'relative_root': root});
}
/**
 * need an absolute path
 * @param  {[type]} root [description]
 * @return {[type]}      [description]
 */
function traverseFolder(root, config) {
    // enum for type
    var T_FOLDER = 1,
        T_FILE = 2;

    config = mixin({
        'file_filter': /.*/, //if RegExp matche, we keep this file tracked. Otherwise, leave it out.
        'folder_ignore': /^_/, //ignore those folder start with _
        'relative_root': root
    }, config, true);
    if (!exists(root)) {
        console.log("root["+ root +"] is not found!");
        return false;
    }

    var rel_root = config.relative_root;

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
            'id':'f' + s4() + (new Date() -0).toString().substring(8),
    		//'id': (id_prefix + Path.relative(rel_root, path)).replace(/\s/g, '_'), //replace all the blanks into _ to avoid risk.
    		'name': Path.basename(path, '.md'),//for md file, we should hide its ext
            'path': Path.relative(rel_root, path),
            'ctime' : ctime(path)
    	}

        if (isDir(path)) {
            if (config.folder_ignore&& config.folder_ignore.test(baseName)) {
                return null;
            }
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
                console.log("ignoring " + baseName);
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

    function ctime(path) {
        var date = fs.lstatSync(path)['ctime'];
        return util.format("%s-%s-%s", date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    function exists(path) {
        return fs.existsSync(path)
    }
}

function guid() {
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	     s4() + '-' + s4() + s4() + s4();
}
function s4() {return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1) }
/**
 * Usage: util.eachProp(obj, function(propVal, propName){....});
 * @param obj
 * @param fn
 */
function eachProp(obj, fn) {
    var prop;
    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            if (fn(obj[prop], prop)) {
                break;
            }
        }
    }
}
/**
 * Simple function to mix in properties from source into target,
 * but only if target does not already have a property of the same name.
 * force表示是否强制覆盖，如果设置为true,则无论target是否已经有这个属性都会被source覆盖
 * deepStringMixin表示是否是深度拷贝，如果为true，则进行递归深拷贝
 */
function mixin(target, source, force, deepStringMixin) {
    if (source) {
        eachProp(source, function (value, prop) {
            //如果target没有prop这个属性或force设置设true
            if (force || !hasProp(target, prop)) {
                //判断是否是深拷贝
                if (deepStringMixin && typeof value !== 'string') {
                    if (!target[prop]) {
                        target[prop] = {};
                    }
                    mixin(target[prop], value, force, deepStringMixin);
                } else {
                    target[prop] = value;
                }
            }
        });
    }
    return target;
}

exports.path_to_json = traverseFolder;