$(function(){
  
  var editor
    , converter
    , socket
    //, paperImgPath = '/img/notebook_paper_200x200.gif'
    , profile = 
      {
        theme: 'ace/theme/idle_fingers'
      , showPaper: true
      , currentMd: ''
      , autosave: 
        {
          enabled: true
        , interval: 3000 // might be too aggressive; don't want to block UI for large saves.
        }
      , current_filename : 'Untitled Document'
      , dropbox:
        {
          filepath: '/Dillinger/'
        }
      }

  // Feature detect ish
  var dillinger = 'dillinger'
    , dillingerElem = document.createElement(dillinger)
    , dillingerStyle = dillingerElem.style
    , domPrefixes = 'Webkit Moz O ms Khtml'.split(' ')
    
  // Cache some shit
  var $theme = $('#theme-list')
    , $editor = $('#editor')
    , $preview = $('#preview')
    , $autosave = $('#autosave')
    , $import_github = $('#import_github')
    , $folder = $("#folder")
    , $file = $("#file")
    , $content = $("#content")
    , $doc = $(document)

  var selectingfile = null //file we currently viewing, may not be editing
    , editingfile = null  //file we currently editing & viewing
    , selectingfolder = null //folder we currently working on
    , lastSavedData = null   // cache what we have saved last time
  // Hash of themes and their respective background colors
  var bgColors = 
    {
      'chrome': '#bbbbbb'
    , 'clouds': '#7AC9E3'
    , 'clouds_midnight': '#5F9EA0'
    , 'cobalt': '#4d586b'
    , 'crimson_editor': '#ffffff'
    , 'dawn': '#DADCAD'
    , 'eclipse': '#6C7B8A'
    , 'idle_fingers': '#DEB887'
    , 'kr_theme': '#434343'
    , 'merbivore': '#3E353E'
    , 'merbivore_soft': '#565156'
    , 'mono_industrial': '#C0C0C0'
    , 'monokai': '#F5DEB3'
    , 'pastel_on_dark': '#676565'
    , 'solarized-dark': '#0E4B5A'
    , 'solarized_light': '#dfcb96'
    , 'textmate': '#fff'
    , 'tomorrow': '#0e9211'
    , 'tomorrow_night': '#333536'
    , 'tomorrow_night_blue': '#3a4150'
    , 'tomorrow_night_bright': '#3A3A3A'
    , 'tomorrow_night_eighties': '#474646'
    , 'twilight': '#534746'
    , 'vibrant_ink': '#363636'
    }
      
      
  /// UTILS =================
  

  /**
   * Utility method to async load a JavaScript file.
   *
   * @param {String} The name of the file to load
   * @param {Function} Optional callback to be executed after the script loads.
   * @return {void}
   */
  function asyncLoad(filename,cb){
    (function(d,t){

      var leScript = d.createElement(t)
        , scripts = d.getElementsByTagName(t)[0]
      
      leScript.async = 1
      leScript.src = filename
      scripts.parentNode.insertBefore(leScript,scripts)

      leScript.onload = function(){
        cb && cb()
      }

    }(document,'script'))
  }
  
  /**
   * Utility method to determin if localStorage is supported or not.
   *
   * @return {Boolean}
   */
  function hasLocalStorage(){
   // http://mathiasbynens.be/notes/localstorage-pattern  
   var storage
   try{ if(localStorage.getItem) {storage = localStorage} }catch(e){}
   return storage
  }

  /**
   * Grab the user's profile from localStorage and stash in "profile" variable.
   *
   * @return {Void}
   */
  function getUserProfile(){
    
    var p
    
    try{
      p = JSON.parse( localStorage.profile )
      // Need to merge in any undefined/new properties from last release 
      // Meaning, if we add new features they may not have them in profile
      p = $.extend(true, profile, p)
    }catch(e){
      p = profile
    }

    profile = p
    
    // console.dir(profile)
  }
  
  /**
   * Update user's profile in localStorage by merging in current profile with passed in param.
   *
   * @param {Object}  An object containg proper keys and values to be JSON.stringify'd
   * @return {Void}
   */
  function updateUserProfile(obj){
    localStorage.clear()
    localStorage.profile = JSON.stringify( $.extend(true, profile, obj) )
  }

  /**
   * Utility method to test if particular property is supported by the browser or not.
   * Completely ripped from Modernizr with some mods. 
   * Thx, Modernizr team! 
   *
   * @param {String}  The property to test
   * @return {Boolean}
   */
  function prefixed(prop){ return testPropsAll(prop, 'pfx') }

  /**
   * A generic CSS / DOM property test; if a browser supports
   * a certain property, it won't return undefined for it.
   * A supported CSS property returns empty string when its not yet set.
   *
   * @param  {Object}  A hash of properties to test
   * @param  {String}  A prefix
   * @return {Boolean}
   */
  function testProps( props, prefixed ) {
      
      for ( var i in props ) {
        
          if( dillingerStyle[ props[i] ] !== undefined ) {
              return prefixed === 'pfx' ? props[i] : true
          }
      
      }
      return false
  }

  /**
   * Tests a list of DOM properties we want to check against.
   * We specify literally ALL possible (known and/or likely) properties on
   * the element including the non-vendor prefixed one, for forward-
   * compatibility.
   *
   * @param  {String}  The name of the property
   * @param  {String}  The prefix string
   * @return {Boolean} 
   */
  function testPropsAll( prop, prefixed ) {

      var ucProp  = prop.charAt(0).toUpperCase() + prop.substr(1)
        , props   = (prop + ' ' + domPrefixes.join(ucProp + ' ') + ucProp).split(' ')

      return testProps(props, prefixed)
  }
  
  /**
   * Normalize the transitionEnd event across browsers.
   *
   * @return {String} 
   */
  function normalizeTransitionEnd()
  {

    var transEndEventNames = 
      {
        'WebkitTransition' : 'webkitTransitionEnd'
      , 'MozTransition'    : 'transitionend'
      , 'OTransition'      : 'oTransitionEnd'
      , 'msTransition'     : 'msTransitionEnd' // maybe?
      , 'transition'       : 'transitionend'
      }

     return transEndEventNames[ prefixed('transition') ]
  }


  /**
   * Generate a random filename.
   *
   * @param  {String}  The file type's extension
   * @return {String} 
   */
  function generateRandomFilename(ext){
    return 'dillinger_' +(new Date()).toISOString().replace(/[\.:-]/g, "_")+ '.' + ext
  }


  /**
   * Get current filename from contenteditable field.
   *
   * @return {String} 
   */
  function getCurrentFilenameFromField(){
    return $('#filename > span[contenteditable="true"]').text()
  }


  /**
   * Set current filename from profile.
   *
   * @param {String}  Optional string to force set the value. 
   * @return {String} 
   */
  function setCurrentFilenameField(str){
    $('#filename > span[contenteditable="true"]').text( str || profile.current_filename || "Untitled Document")
  }


  /**
   * Initialize application.
   *
   * @return {Void}
   */
  function init(){

    if( !hasLocalStorage() ) { sadPanda() }
    else{
      
      // Attach to jQuery support object for later use.
      $.support.transitionEnd = normalizeTransitionEnd()
      
      getUserProfile()

      initAce()
      
      initUi()

      converter = new Showdown.converter()

      //绑定事件，每一次keyup，都会触发preview的刷新
      bindPreview()

      //为Navigation Bar上的元素绑定事件
      bindNav()
      
      //绑定快捷键，如Ctrl + S触发Save.
      bindKeyboard()
      
      //为还末创建的元素绑定事件，即由document来代理
      bindDelegation()
      
      //自动保存
      autoSave()

      //init socket
      initSocket()

      initFileManager()

    }

  }

    function initFileManager() {
        fileManager.set("dataset", [
            g_file_tree
        ]);
        fileManager.render();

        fileManager.on("fileNameChange", function(file, param) {
            socket.emit('request.file.rename', {'folder': selectingfolder, 'file':file, 'nt':param['nt']})
        });

        fileManager.on("folderSelect", function(data) {
            selectingfolder = data;
            showFileList();
        });

        fileManager.on("fileSelect", function(data) {
            selectingfile = data;
            socket.emit('request.open.file', data);
        });
        fileManager.on("fileDBClick", function(data){
            var file_id = data['id'];
            selectingfile = data;
            if (selectingfile && selectingfile['id'] == file_id) {
                // if the file is already selecting before, show the Editor immediately
                showEditor()
            } else {
                socket.emit('request.open.file', data);
            }
            showEditor()// TODO: actually we need to show the editor after we receive the file content
        });
        fileManager.on("createFile", function(file) {
            if (file) {
                Notifier.showMessage("create file successfully");
            }
        })
    }
  function initSocket() {
    socket = io.connect();

    /* file save */
    socket.on('response.open.file', function(data) {
      editor.getSession().setValue(data)
      previewMd()
    });     

    socket.on('response.save.file', function(data) {
      Notifier.showMessage(data)
    })
    /* file end */
    /* file rename */
    /**
     * data should contain 
     * $success -> wether success
     * $prev_id -> which file we should rename
     * $data -> a complete file info containing title, id, ctime....; if fails, it should be null.
     */
    socket.on('file.rename.msg', function(data) {
      if (data['success']) {
        Notifier.showMessage('file rename successfully')
        if (selectingfile && selectingfile.id == data.prev_id) {
          selectingfile = data['data'];
        }
      } else {
        Notifier.showMessage('file rename failed')
      }
      fileManager.changeFileName(data['prev_id'], data['data'])
    })
    /* file rename end*/

    /* file search */
    socket.on('response.search', function(file){
        if(!file) return;
        console.log(file);
        fileManager.addToSearchList(file);
        showFileList();
    })
  }

  /**
   * Initialize theme and other options of Ace editor.
   *
   * @return {Void}
   */
  function initAce(){
    
    editor = ace.edit("editor")
    editor.setKeyboardHandler("ace/keyboard/vim");
    
  } // end initAce

  /**
   * Initialize various UI elements based on userprofile data.
   *
   * @return {Void}
   */
  function initUi(){
    
    // Set proper theme value in theme dropdown
    fetchTheme(profile.theme, function(){
      $theme.find('li > a[data-value="'+profile.theme+'"]').addClass('selected')

      //Sets whether or not line wrapping is enabled
      editor.getSession().setUseWrapMode(true)
      editor.setShowPrintMargin(false)

      editor.getSession().setMode('ace/mode/markdown')
      
      editor.getSession().setValue( profile.currentMd || editor.getSession().getValue())
      
      // Immediately populate the preview <div>
      previewMd()

      adjustWindow();
      
    })
    
    /* BEGIN RE-ARCH STUFF */

    $('.dropdown-toggle').dropdown()
    
    /* END RE-ARCH STUFF */

  }

  function adjustWindow() {
    var folderWidth = $folder.width(),
        fileWidth = $file.width(),
        docWidth = $doc.width()

    var width = docWidth;
    var left = 0;
    var i = 0;

    if ($folder.css('display') != "none") {
        $file.css('left', (folderWidth + 20) +'px')
        width = width - folderWidth;
        left += folderWidth + 10;
        i++;
    } else {
        $file.css('left', '0px')
    }

    if ($file.css('display') != "none") {
      width = width - fileWidth;
      left += fileWidth + 10;
      i++;
    }
    if ($editor.css('display') == "none") {
        $preview.css("left", "0%");
    } else {
        $preview.css("left", "50%");
    }
    if ($preview.css('display') == "none") {
        $editor.css("right", "0%");
    } else {
        $editor.css("right", "50%");
    }
    $content.css("width", (width - 20) - 10*i + "px")
    $content.css("left", left + "px")

    editor.resize(true); //force to resize the editor for the new $content size
  }


  /// HANDLERS =================

  
  /**
   * Clear the markdown and text and the subsequent HTML preview.
   *
   * @return {Void}
   */
  function clearSelection(){
    editor.getSession().setValue("")
    previewMd()    
  }

  // TODO: WEBSOCKET MESSAGE?
  /**
   * Save the markdown via localStorage - isManual is from a click or key event.
   *
   * @param {Boolean} 
   * @return {Void}
   */
  function saveFile(isManual, toServer){
    
    var content = editor.getSession().getValue();
    updateUserProfile({currentMd: content})
    //isManual && Notifier.showMessage(Notifier.messages.docSavedLocal)

    if (!toServer || !selectingfile) return;

    //we shouldn't auto request the server since we haven't changed anything
    if (lastSavedData == content && !isManual) {
        console.log("do not request server to save due to we haven't change anything")
        return;
    }
    // save back to server
    if (fileManager.pds[selectingfile.id]) {
      lastSavedData = content;
      socket.emit('request.save.file', 
                {
                  'path': selectingfile.path,
                  'content': content
                }
      );
    }
  }
  
  /**
   * Enable autosave for a specific interval.
   *
   * @return {Void}
   */
  function autoSave(){

    if(profile.autosave.enabled){
      autoLocalInterval = setInterval( function(){
        // firefox barfs if I don't pass in anon func to setTimeout.
        saveFile()
      }, 5 * 1000)

      autoServerInterval = setInterval( function(){
        saveFile(null, true);
      }, 40 * 1000)
      
    }
    else{
      clearInterval( autoLocalInterval )
      clearInterval( autoServerInterval )
    }

  }
  
  /**
   * Clear out user profile data in localStorage.
   *
   * @return {Void}
   */
  function resetProfile(){
    // For some reason, clear() is not working in Chrome.
    localStorage.clear()
    // Let's turn off autosave
    profile.autosave.enabled = false
    // Delete the property altogether --> need ; for JSHint bug.
    ; delete localStorage.profile
    // Now reload the page to start fresh
    window.location.reload()
//    Notifier.showMessage(Notifier.messages.profileCleared, 1400)
  }

  /**
   * Dropbown nav handler to update the current theme.
   *
   * @return {Void}
   */  
   function changeTheme(e){
     // check for same theme
     var $target = $(e.target)
     if( $target.attr('data-value') === profile.theme) { return }
     else{
       // add/remove class
       $theme.find('li > a.selected').removeClass('selected')
       $target.addClass('selected')
       // grabnew theme
       var newTheme = $target.attr('data-value')
       $(e.target).blur()
       fetchTheme(newTheme, function(){
         Notifier.showMessage(Notifier.messages.profileUpdated)
       })
      }
   }  
  
  // TODO: Maybe we just load them all once and stash in appcache?
  /**
   * Dynamically appends a script tag with the proper theme and then applies that theme.
   *
   * @param {String}  The theme name
   * @param {Function}   Optional callback
   * @return {Void}
   */  
  function fetchTheme(th, cb){
    var name = th.split('/').pop()

    asyncLoad("/js/theme-"+ name +".js", function(){

      editor.setTheme(th)

      cb && cb()
      
      updateBg(name)
      
      updateUserProfile({theme: th})
    
    }) // end asyncLoad

  } // end fetchTheme(t)
  
  /**
   * Change the body background color based on theme.
   *
   * @param {String}  The theme name
   * @return {Void}
   */  
  function updateBg(name){
    document.body.style.backgroundColor = bgColors[name]
  }
  
  /**
   * Clientside update showing rendered HTML of Markdown.
   *
   * @return {Void}
   */  
  function previewMd(){
    
    var unmd = editor.getSession().getValue()
      , md = marked(unmd)
    
    $preview
      .html('') // unnecessary?
      .html(md)

    //hljs是highlight.js输出的全局变量
    //自动格式化preview中的代码
    $("#preview pre>code").each(function(){
      hljs.highlightBlock(this);
    });
  }

  /**
   * XHR Post Markdown to get a md file.  Appends response to hidden iframe to 
   * automatically download the file.
   *
   * @return {Void}
   */  
  function fetchMarkdownFile(){
    
    // TODO: UPDATE TO SUPPORT FILENAME NOT JUST A RANDOM FILENAME
    var unmd = editor.getSession().getValue()
    
    function _doneHandler(a, b, response){
      a = b = null // JSHint complains if a, b are null in method
      var resp = JSON.parse(response.responseText)
      // console.dir(resp)
      document.getElementById('downloader').src = '/files/md/' + resp.data
    }

    function _failHandler(){
        alert("Roh-roh. Something went wrong. :(")
    }
    
    var mdConfig = {
                      type: 'POST',
                      data: "unmd=" + encodeURIComponent(unmd),
                      dataType: 'json',
                      url: '/factory/fetch_markdown',
                      error: _failHandler,
                      success: _doneHandler
                    }

    $.ajax(mdConfig)  
    
  }

  /**
   * XHR Post Markdown to get a html file.  Appends response to hidden iframe to 
   * automatically download the file.
   *
   * @return {Void}
   */  
  function fetchHtmlFile(){
    
    // TODO: UPDATE TO SUPPORT FILENAME NOT JUST A RANDOM FILENAME
    
    var unmd = editor.getSession().getValue()

    function _doneHandler(jqXHR, data, response){
      // console.dir(resp)
      var resp = JSON.parse(response.responseText)
      document.getElementById('downloader').src = '/files/html/' + resp.data
    }

    function _failHandler(){
      alert("Roh-roh. Something went wrong. :(")
    }

    var config = {
                      type: 'POST',
                      data: "unmd=" + encodeURIComponent(unmd),
                      dataType: 'json',
                      url: '/factory/fetch_html',
                      error: _failHandler,
                      success: _doneHandler
                    }

    $.ajax(config)  
    
  }

  /**
   * Show a sad panda because they are using a shitty browser. 
   *
   * @return {Void}
   */  
  function sadPanda(){
    // TODO: ACTUALLY SHOW A SAD PANDA.
    alert('Sad Panda - No localStorage for you!')
  }

  var windowManager = {
      showFolder: function() {
          $folder.show();
      },
      hideFolder: function() {
          $folder.hide();
      },
      showFileList: function() {
          $file.show();
      },
      hideFileList: function() {
          $file.hide();
      },
      showEditor: function() {
          $editor.show();

      },
      hideEditor: function() {
          $editor.hide();
      },
      showPreview: function() {
          $preview.show();
      },
      hidePreview: function() {
          $preview.hide();
      }
  }



  /// UI RELATED =================

  /**
   * Bind keyup handler to the editor.
   *
   * @return {Void}
   */  
  function bindPreview(){
    $('#editor').bind('keyup', previewMd)
  }
  
  /**
   * Bind navigation elements.
   *
   * @return {Void}
   */  
  function bindNav(){

    $("#search").submit(function(e){
        e.preventDefault();
        var pattern = $(this).find('input[name=pattern]')[0].value;
        pattern = $.trim(pattern);
        if (!pattern.length) return false;
        socket.emit('request.search', {
            id: Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1),
            pattern: pattern,
            fps: fileManager.getFileList()
        })
        fileManager.clearFileWorkingList();
    });

    $("#open-image-palette").click(function(){
        imagepalette.popup();
        var callback = function(){};
        // register a function to imagepalette which will be called when
        // palette read the image and send the binary data for this function
        // together with a callback.
        imagepalette.register(function(buffer, cb){
            socket.emit("request.send.file", 'noname', buffer);
            callback = cb;
        });
        socket.on('response.send.file', function(filename){
            callback('![Alt text](' + filename + ' "Optional title")');
            console.log('response.send.file:', filename)
        })
    });

    function iconToggle(elem) {
        var $e = $(elem),
            src = $e.attr('src'),
            hide = false;
        if (/_blue_48/.test(src)) {
            src = src.replace("_blue_48.png", "_48.png");
            hide = true;
        } else {
            src = src.replace("_48.png", "_blue_48.png");
            hide = false;
        }
        $e.attr('src', src);
        return hide;
    }

    $.each(["Folder", "FileList", "Editor", "Preview"], function(inx, val){
       $("#toggle" + val).click(function(){
           var hide = iconToggle(this);
           if (hide) {
               windowManager['hide' + val]();
           } else {
               windowManager['show' + val]();
           }
           adjustWindow();
       })
    });

      $theme
      .find('li > a')
      .bind('click', function(e){
        changeTheme(e)
        return false
      })
  } // end bindNav()

  /**
   * Bind special keyboard handlers.
   *
   * @return {Void}
   */  
  function bindKeyboard(){
    // CMD+s TO SAVE DOC
    key('command+s, ctrl+s', function(e){
     saveFile(true, true)
     e.preventDefault() // so we don't save the webpage - native browser functionality
    })

  }

  /**
   * Bind dynamically added elements' handlers.
   *
   * @return {Void}
   */  
  function bindDelegation(){
    $(document)
      .on('click', '.repo', function(){
        var repoName = $(this).parent('li').attr('data-repo-name')
        
        Github.isRepoPrivate = $(this).parent('li').attr('data-repo-private') === 'true' ? true : false
                
        Github.fetchBranches( repoName ) 
        return false
      })
      .on('click', '.branch', function(){
        
        var repo = $(this).parent('li').attr('data-repo-name')
          , sha = $(this).parent('li').attr('data-commit-sha')
        
        Github.currentBranch = $(this).text() 
        
        Github.fetchTreeFiles( repo, sha ) 
        return false
      })
      .on('click', '.tree_file', function(){

        var file = $(this).parent('li').attr('data-tree-file')

        Github.fetchMarkdownFile(file)
          
        return false
      })
      .on('click', '.dropbox_file', function(){
        
        // We stash the current filename in the local profile only; not in localStorage.
        // Upon success of fetching, we add it to localStorage.
        
        var dboxFilePath = $(this).parent('li').attr('data-file-path')

        profile.current_filename = dboxFilePath.split('/').pop().replace('.md', '')

        Dropbox.setFilePath( dboxFilePath )

        Dropbox.fetchMarkdownFile( dboxFilePath )
          
        return false
        
      })

    $folder.on("click", 'li', function(e){
      $folder.find('label').removeClass("current");
      e.stopPropagation();
      var label = $($(this).find('label')[0]);
      label.addClass("current");
    })
  }


  /// MODULES =================


  // Notification Module
  var Notifier = (function(){
    
    var _el = $('#notify')      
    
      return {
        messages: {
          profileUpdated: "Profile updated"
          , profileCleared: "Profile cleared"
          , docSavedLocal: "Document saved locally"
          , docSavedServer: "Document saved on our server"
          , docSavedDropbox: "Document saved on dropbox"
          , dropboxImportNeeded: "Please import a file from dropbox first."
        },
        showMessage: function(msg,delay){
          
          // TODO: FIX ANIMATION QUEUE PROBLEM - .stop() doesn't work.

          _el
            .text('')
            .stop()
            .text(msg)
            .slideDown(250, function(){
              _el
                .delay(delay || 1000)
                .slideUp(250)
            })

          } // end showMesssage
      } // end return obj
  })() // end IIFE

  var fileManager = new FileManager($folder[0], $file[0]);

  init()
  
 
  $(window).resize(function(){
    adjustWindow()
  });

  window.onload = function(){
    var $loading = $('#loading')
    
    $loading
      .bind($.support.transitionEnd, function(){
        $('#main').removeClass('bye')
        $loading.remove()
      })
      .addClass('fade_slow')
      
  }

})
