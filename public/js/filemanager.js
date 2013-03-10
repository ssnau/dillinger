var FileManager = (function() {
	var TYPE_FOLDER = 1,
		TYPE_FILE = 2,
        untitled = 1;

    var busyOverlay = $([
        "<div style='",
            "position:fixed;index:999;background:rgba(200,200,200,.4);display:-moz-box;-moz-box-pack:center;-moz-box-align:center;display:-webkit-box;-webkit-box-pack:center;-webkit-box-align:center;display:box;box-pack:center;box-align:center;",
            "'>",
            "<img src='http://loadinggif.com/images/image-selection/13.gif'/>",
        "</div>"
    ].join("\n"));

	var folderMarkup = [
		"<div class='folder-tree' style='position:absolute;width:100%;z-index:5'>",
		"</div>",
		"<div class='marquee' style='position:absolute;background-color:#ccc;z-index:4'>",
		"</div>"
	].join("\n");

	var root_folder_tmpl = [
		"<div class='css-treeview'>",
			"<ul>",
				"${content}",
			"</ul>",
		"</div>"
	].join("\n");

	var folder_tmpl = [
		"<li class='item'>", 
			"<input type='checkbox' id='${id}' />",
			"<label class='${lbclass}' for='${id}'>${name}</label>",
			"<ul>",
				"${content}",
			"</ul>",
		"</li>"
	].join("\n");

	var root_file_tmpl = [
			"<ul class='css-file-view'>",
				"${content}",
			"</ul>"
	].join("\n");

	var file_tmpl = [
	"<li class='item' id='${id}'>",
		"<div class='title' contenteditable='true'>${name}</div>",
		"<div class='property'>",
			"<span class='ctime'>${ctime}</span>",
			/*"<span class='tag'>${tags}</span>",*/
			/*"<span class='preview'>${preview}</span>",*/
		"</div>",
	"</li>"
	].join("\n");

	/**
	 * replace MARCOs with options
	 */
	function getFromTemplate(tpl, options) {
		var str = tpl;
        options = options || {};
		$.each(options, function(key, value) {
			str = str.replace(new RegExp("\\$\\{" + key + "\\}", 'g'), value);
		});
		return str;
	}
	/**
	 * generate a guid.
	 */
	function guid() {
		function s4() {return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1) }
		return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
		     s4() + '-' + s4() + s4() + s4();
	}
	/**
	 * Make each folder/file storage in a key/value way.
	 * store a reference for their parent
	 */
	function initData(dataset) { //TODO: make it to be a method of filemanager
		var pData = {};
		traverse(dataset, null);
		return pData;

		function traverse(data, parent) {
			$.each(data, function(index, item){
				if (!item.id) item.id = guid();
				pData[item.id] = item;
                pData[item.id]["ppath"] = parent && parent.path; //only save parent's path for avoiding circular parsing
				// set enumerable to be false to avoid circular structure when calling JSON.stringify
                // it is more useful on client side.
				Object.defineProperty(pData[item.id],
                'parent', { value:  parent,
                          writable:     true,
                          configurable: true,
                          enumerable:   false})
				if (item.children) {
					traverse(item.children, item)
				}
			})
		}
	}
	/**
	 * Using template to create DOM Node.
	 * data should in such structure:
	 * {
	 *	id: "fxxxx",
	 *	name: String, //the name to be display
	 *	type: ENUM, // 1 ->folder, 2 -> file
	 *	children: [...] //for file type, it should not contains children
	 * }
	 * @return String
	 */
	function createItem(data, options) {
		options = $.extend({//these options will be override
			'skip_files': true, //do not render files in folder panel
			'skip_folder_pattern': null,//Regex to filter folder
			'skip_file_pattern': null//Regex to filter file
		}, options || {})

		if (!data) return '';
		if (!data['id']) data['id'] = guid();

		//filter files or folders
		if (data['type'] == TYPE_FILE) {
			if (options['skip_files']) return '';
			if (options['skip_file_pattern'] && options['skip_file_pattern'].test(data.name)) {
				return '';
			}
		} else if (data['type'] == TYPE_FOLDER) {
			if (options['skip_folder_pattern'] && options['skip_folder_pattern'].test(data.name)) {
				return '';
			}
		}

		var id = data['id'],
			name = data['name'],
			content = '',
			lbclass = '';
		if (data['children']) {
			$.each(data['children'], function(index, child) {
				content += createItem(child);
			});
		} else {
			content = '';
		}

		//if it has no children, or if its children has all been filtered.
		if (content == '') {
			lbclass = 'empty';
		}
		return getFromTemplate(folder_tmpl, {
			'id': id,
			'name': name,
			'content': content,
			'lbclass': lbclass
		})
	}

	/**
	 * bind certain event with certain name
	 * @param  {[type]} fm [description]
	 * @return {[type]}    [description]
	 */
	function initEventHandle(fm) {
		var em = fm.eventManager,
			$fn = $(fm.fn),
			$fln = $(fm.fln);

		// when click on ".folder-tree li" element, trigger folderSelect event
		$fn.find(".folder-tree").on('click', 'li', em.exec('folderSelect'));
		$fn.find(".folder-tree").on('contextmenu', 'li', em.exec('folderRMC'));
		// trigger fileSelect event
		$fln.on('click', 'li.item', em.exec('fileSelect'));


		//when select a folder, it should not bubble up
		em.addHandler('folderSelect', stopPropagation);
		em.addHandler('folderRMC', stopPropagation);
		em.addHandler('folderRMC', preventDefault);
		function stopPropagation(e){
			e.stopPropagation();
		}
		function preventDefault(e){
			e.preventDefault();
		}
	}
	/**
	 * bind actions when click on folders/files
	 * @return {[type]}
	 */
	function bindActions(fm) {
		var $fn = $(fm.fn),
			$fln = $(fm.fln),
			$marquee = $(fm.marquee),
			em = fm.eventManager;


		em.addHandler('folderSelect', folderClick);
        em.addHandler('folderSelect', function(){
            fm.searchmode = false;
        });
		em.addHandler('fileSelect', fileClick);
        $fln.on('keyup', '.title', function(e){
            if (e.keyCode == 13) {//ENTER
                this.blur();
            }
        })

		contextmenu.register(fm.fln, {
            'name': 'fileCMM',
            'getItems': function() {
                // there should be some filter under certain condition.
                return [
                    {'cmd': 'createNewFile', 'text': 'Create New File'}
                ]
            },
            'confirm': function() {
                // when there are folder is selected or in search mode
                if (!fm.cfolder || fm.searchmode) {
                    return false;
                }
                return true;
            },
            'exec': {
                'createNewFile': function() {
                    busy(fm, 'file');
                    setTimeout(function(){
                    $.ajax({
                        url: "/files/create",
                        data: {
                            'path': fm.cfolder.path
                        },
                        async: false   //we need to sync request it!
                    }).done(function ( data ) {
                        var item = JSON.parse(data);
                        if (item && item.id) { //means that we create it successfully
                            var nd = $(getFromTemplate(file_tmpl, item));
                            fm.cfolder.children.push(item);
                            fm.pds = initData(fm.ds);
                            nd.prependTo($fln.find('.css-file-view'));
                            nd.find('.title').focus();
                            $fln.scrollTop(0); // scroll to top
                            em.exec('createFile')(item);
                        }
                        unbusy(fm);
                    });
                    }, 10);
                }
            }
        })
		function folderClick () {
			var ndLi = $(this),
				liOffset = ndLi.offset(),
				liTop = liOffset.top,
				fnTop = $fn.offset().top,
				fnScrollTop = $fn.scrollTop();

			/* effect */
			$marquee.css('width', $fn.css('width')) //$fn.width() will only the content with, do not include padding & border
					.css('height', "26px")
					.css('top', (liTop - fnTop + fnScrollTop - 2) + "px")
					.css('left', '0px');

			$fn.find('label').css('font-weight', 'normal');
			$(this).find("label").first().css('font-weight', 'bold');

			/* show files*/
			var id = $(this).find("input").first().attr("id");
            fm.cfolder = fm.pds[id];
			showfiles(id);
		}

		function fileClick() {
			$fln.find('li.item').removeClass('current');
			$(this).addClass('current');
            var id = $(this).attr('id')
            fm.cfile = fm.pds[id]
		}

		function showfiles(id) {
			// must put ds & pds here, because it may be null for bindActions when user haven't set dataset
			var pds = fm.pds;
            busy(fm, 'file');
			$fln.html(); //clear previous list
			if (!pds[id] || !pds[id]['children']) return;
			var html = '';
			$.each(pds[id]['children'], function(ind, item){
				if (item.type == TYPE_FILE) {
					html += getFromTemplate(file_tmpl, {
						"id" : item['id'],
						"name": item['name'],
						"ctime": item['ctime'],
						"tags": item['tags'],
						"preview": /*item['preview']*/"Gits：可以轻松集成 GitHub SFTP：直接编辑 FTP 或 SFTP 服务器上的文件 ZenCoding：这货对于前端的同学来说不得了，可以超快速编写HTML文件 (视频演示) ConvertToUTF8：ST2只支持utf8编码，该插件可以显示与编辑 GBK, BIG5, EUC-KR, EUC-JP, Shift_JIS 等编码的文件"
					});
				}
			})
			// wrap with root_file_tmpl
			html = getFromTemplate(root_file_tmpl, {'content':html});
			$fln.html(html);
            unbusy(fm);
		}
	}

    /**
     * block the section that user cannot click on it and showing the loading icon.
     * @param name
     */
    function busy(fm, name) {
        var $fn = $(fm.fn),
            $fln = $(fm.fln),
            $nd = null;

        if (name == "folder") {
            $nd = $fn;
        }
        if (name == 'file') {
            $nd = $fln;
        }
        busyOverlay.
            css('width', $nd.width()).
            css('height', $nd.height()).
            css('top', $nd.offset().top + 'px').
            css('left', $nd.offset().left + 'px');

        busyOverlay.appendTo(document.body);
        busyOverlay.show();
    }

    function unbusy(fm) {
        busyOverlay.fadeOut(100);
    }
	// API method
	var api = {
		set: function(name, value) {
			switch (name) {
				case "dataset":
					this.ds = value;
					this.pds = initData(this.ds);
				break;
				case "foldernode":
					this.fn = value;
				break;
				case "filelistnode":
					this.fln = value;
				break;
			}
		},
		render: function() {
			if (!this.fn) console.log("no folder node assigned.")
			if (!$.isArray(this.ds)) console.log("dataset is not an array!")
			var result = '';
			$.each(this.ds, function(index, item) {
				result += createItem(item);
			})
			result = getFromTemplate(root_folder_tmpl, {'content': result})
			$(this.fn).find('.folder-tree').html(result);//clear first, and then assign the result
		},
		changeFileName: function(id, newfile) {
			var file = this.pds[id],
				node = $(document.getElementById(id)),//use native method to avoid crashing when complicated id that containing special character
				newid= newfile['id'],
				pfolder = file.parent;

			// if new file is not null
			if (newfile) {
				$.each(pfolder.children, function(inx, v){
					if (v.id == id) {
						pfolder.children[inx] = newfile;
						return false;
					}
				})
				this.pds = initData(this.ds); //re-init pds to make it sync with this.data
				//set properties for that dom node
				node.attr('id', newid);
				node.find('.title').html(newfile['name']);
			} else {
				// set the title back to the origin
				node.find('.title').html(file['name']);
			}

		},
        getFileList: function(){
            var list = [];
            $.each(this.pds, function(inx, val) {
                if (val.type == TYPE_FILE) list.push(val);
            })
            return list;
        },
        addToSearchList: function(item) {
            var $fln = $(this.fln);

            var ul = $fln.find('ul.css-file-view'); //get the ul
            if (!ul[0]) { // if it does not exists
                ul = $(getFromTemplate(root_file_tmpl));
                ul.appendTo($fln);
            }
            this.searchmode != item['searchtask_id'] && ul.html(''); //if it is not in searchmode before or not the same task, clear it first.
            this.searchmode = item['searchtask_id'];
            var html = getFromTemplate(file_tmpl, {
                        "id" : item['id'],
                        "name": item['name'],
                        "ctime": item['ctime'],
                        "tags": item['tags'],
                        "preview": /*item['preview']*/"Gits：可以轻松集成 GitHub SFTP：直接编辑 FTP 或 SFTP 服务器上的文件 ZenCoding：这货对于前端的同学来说不得了，可以超快速编写HTML文件 (视频演示) ConvertToUTF8：ST2只支持utf8编码，该插件可以显示与编辑 GBK, BIG5, EUC-KR, EUC-JP, Shift_JIS 等编码的文件"
            });
            $(html).appendTo(ul);
        },
		/**
		 * custom event for user to bind, fn should accept two parameters.
		 * fn (data, extraParams), data represent for the pds data, and extraParams contain specific info
		 */
		on: function(eventName, fn) { 
			var me = this,
				em = me.eventManager;

			switch(eventName) {
				case "folderSelect":
					me.eventManager.addHandler(eventName, function(e){
						var fid = $(this).attr('id'),
							data = me.pds[fid];

						fn(data);
					})
					break;
				case "fileNameChange": 
					$(me.fln).on('blur', '.title', function(e) {
						var ndTitle = $(this),
							ndFileLi = ndTitle.parent(),
							id = ndFileLi.attr('id'),
							newTitle = $.trim(ndTitle.text()),
							oldTitle = $.trim(me.pds[id]['name']);

						if (newTitle != oldTitle) {
							fn(me.pds[id], {'nt': newTitle, 'ot': oldTitle});
						}
						e.stopPropagation();
					});
					break;
				case "fileSelect":
				case "fileClick":
					em.addHandler('fileSelect', function(e){
						var id = $(this).attr('id');
						fn(me.pds[id]);
					});
					break;
				case "fileDBClick":
					$(me.fln).dblclick(function(e){
                        var ele = e.target;
                        while(ele.tagName.toLowerCase() != 'li' && !/item/.test(ele.className)) {
                            if($(me.fln).is(ele)) return; // if the node is fln itself, then we do nothing
                            ele = ele.parentNode;
                        }
                        var id = $(ele).attr('id');
						fn(me.pds[id]);
					});
					break;
                case "createFile":
                   em.addHandler('createFile', function(item){
                       fn(item);
                   })
                   break;
			}
		}
	}

	function EventManager() {

		this.handler = {};
		/**
		 * return a function that call the functions in this.handler[eventName] sequentially
		 * @param  {[type]} eventName [description]
		 * @param  {[type]} e         [description]
		 * @return {[type]}           [description]
		 */
		this.exec = function EM_exec(eventName, e) {
			var me = this; //eventManger itself
			return function(e) {
				var node = this; // cache the node(this) passed from jquery
                if (!me['handler'][eventName]) return;
				$.each(me['handler'][eventName], function(index, f) {
					f.apply(node, [e]);
				})
			}
		}

		this.addHandler = function EM_addHandler(eventName, fn) {
			if (!this['handler'][eventName]) this['handler'][eventName] = [];
			this['handler'][eventName].push(fn);
		}
	}

	var fm = function FileManager(folderNode, filelistNode/*optional*/) {
		var fields = {
			'fn': null, //folder node
			'fln': null, // file list node
			'ds': null, //dataset
			'pds': null, //dataset in a key/value way
            'cfolder': null, //current folder
            'cfile': null, //current file
            'searchmode': null // String indicating the current search task
		};
		$.extend(this, fields);
		this.fn = folderNode;
		this.fln = filelistNode;
		$(this.fn).html(folderMarkup);
		this.marquee = $(this.fn).find('.marquee');
		this.eventManager = new EventManager();
		initEventHandle(this);
		bindActions(this);
	}

	$.extend(fm.prototype, api);//assign api's own properties to fm.prototype
	return fm;
})();