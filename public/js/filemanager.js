var FileManager = (function() {
	var TYPE_FOLDER = 1,
		TYPE_FILE = 2;

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
		"<li>", 
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
			"</ul>",
	].join("\n");

	var file_tmpl = [
	"<li class='item' id='${id}'>",
		"<div class='title' contenteditable='true'>${title}</div>",
		"<div class='property'>",
			"<span class='ctime'>${ctime}</span>",
			"<span class='tag'>${tags}</span>",
			"<span class='preview'>${preview}</span>",
		"</div>",
	"</li>",
	].join("\n");

	/**
	 * replace MARCOs with options
	 */
	function getFromTemplate(tpl, options) {
		var str = tpl;
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
	 */
	function initData(dataset) {
		var pData = {};
		traverse(dataset);
		return pData;

		function traverse(data) {
			$.each(data, function(index, item){
				if (!item.id) item.id = guid();
				pData[item.id] = item;
				if (item.children) {
					traverse(item.children)
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
	 * bind actions when click on folders/files
	 * @return {[type]}
	 */
	function bindActions(fm) {
		var _fm = fm, //cache fm for closure
			$fn = $(fm.fn),
			$fln = $(fm.fln),
			$marquee = $(fm.marquee);

		$fn.find(".folder-tree").on('click', 'li', function(e){
			var ndLi = $(this),
				liOffset = ndLi.offset(),
				liTop = liOffset.top,
				liLeft = liOffset.left,
				fnTop = $fn.offset().top,
				fnScrollTop = $fn.scrollTop();

			e.stopPropagation();
			/* effect */
			$marquee.css('width', $fn.css('width')) //$fn.width() will only only the content with, do not include padding & border
					.css('height', "26px")
					.css('top', (liTop - fnTop + fnScrollTop - 2) + "px")
					.css('left', '0px');

			$fn.find('label').css('font-weight', 'normal');
			$(this).find("label").first().css('font-weight', 'bold');

			/* show files*/
			var id = $(this).find("input").first().attr("id");
			showfiles(id);
		});

		$fln.on('click', 'li.item', function(e) {
			$fln.find('li.item').removeClass('current');
			$(this).addClass('current');
		})

		function showfiles(id) {
			// must put ds & pds here, because it may be null for bindActions when user haven't set dataset
			var ds = _fm.ds,
				pds = _fm.pds;
			$fln.html(); //clear previous list
			if (!pds[id] || !pds[id]['children']) return;
			var html = '';
			$.each(pds[id]['children'], function(ind, item){
				if (item.type == TYPE_FILE) {
					html += getFromTemplate(file_tmpl, {
						"id" : item['id'],
						"title": item['name'],
						"ctime": item['ctime'],
						"tags": item['tags'],
						"preview": /*item['preview']*/"Gits：可以轻松集成 GitHub SFTP：直接编辑 FTP 或 SFTP 服务器上的文件 ZenCoding：这货对于前端的同学来说不得了，可以超快速编写HTML文件 (视频演示) ConvertToUTF8：ST2只支持utf8编码，该插件可以显示与编辑 GBK, BIG5, EUC-KR, EUC-JP, Shift_JIS 等编码的文件"
					});
				}
			})
			// wrap with root_file_tmpl
			html = getFromTemplate(root_file_tmpl, {'content':html});
			$fln.html(html);
		}
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
		/**
		 * custom event for user to bind, fn should accept two parameters.
		 * fn (data, extraParams), data represent for the pds data, and extraParams contain specific info
		 */
		on: function(eventName, fn) { 
			var me = this;
			switch(eventName) {
				case "fileNameChange": 
					$(me.fln).on('keyup', '.title', function(e) {
						var ndTitle = $(this),
							ndFileLi = ndTitle.parent(),
							id = ndFileLi.attr('id'),
							newTitle = $.trim(ndTitle.text()),
							oldTitle = $.trim(me.pds[id]['name']);

						if (newTitle != oldTitle) {
							fn(me.pds[id], newTitle, oldTitle);
						}
						e.stopPropagation();
					});
					break;
				case "fileSelect":
					$(me.fln).on('click', 'li.item', function(e){
						var id = $(this).attr('id');
						fn(me.pds[id]);
					});
					break;
			}
		}
	}

	var fm = function (folderNode, filelistNode/*optional*/) {
		var fields = {
			'fn': null, //folder node
			'fln': null, // file list node
			'ds': null, //dataset
			'pds': null //dataset in a key/value way
		};
		$.extend(this, fields);
		this.fn = folderNode;
		this.fln = filelistNode;
		$(this.fn).html(folderMarkup);
		this.marquee = $(this.fn).find('.marquee');
		bindActions(this);
	}

	$.extend(fm.prototype, api);//assign api's own properties to fm.prototype
	return fm;
})();