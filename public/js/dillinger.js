$(function(){
  
  var editor
    , converter
    , autoInterval
    , githubUser
    , paperImgPath = '/img/notebook_paper_200x200.gif'
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
    , $preview = $('#preview')
    , $autosave = $('#autosave')
    , $import_github = $('#import_github')
    , $folder = $("#folder")
    , $file = $("#file")
    , $content = $("#content")
    , $doc = $(document)

    
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
      
      //第当filename有变化时，updateFilename会被调用
      bindFilenameField()

      //自动保存
      autoSave()

      fileManager.set("dataset", [
        tmpfiledataset
      ]);
      fileManager.render();
      fileManager.on("fileNameChange", function(file, newtitle, oldtitle) {
        console.log(newtitle, oldtitle);
      })
      
    }

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
    
    // Set/unset paper background image on preview
    // TODO: FIX THIS BUG
    $preview.css('backgroundImage', profile.showPaper ? 'url("'+paperImgPath+'")' : 'url("")' )
    
    // Set text for dis/enable autosave
    $autosave.html( profile.autosave.enabled ? '<i class="icon-remove"></i>&nbsp;Disable Autosave' : '<i class="icon-ok"></i>&nbsp;Enable Autosave' )
    
    setCurrentFilenameField()
    
    /* BEGIN RE-ARCH STUFF */

    $('.dropdown-toggle').dropdown()
    
    /* END RE-ARCH STUFF */

  }

  function adjustWindow() {
    var folderWidth = $folder.width(),
        fileWidth = $file.width(),
        docWidth = $doc.width()

    $content.css("width", (docWidth - folderWidth - fileWidth - 30) + "px")
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
  function saveFile(isManual){
    
    updateUserProfile({currentMd: editor.getSession().getValue()})
    
    isManual && Notifier.showMessage(Notifier.messages.docSavedLocal)
  
  }
  
  /**
   * Enable autosave for a specific interval.
   *
   * @return {Void}
   */
  function autoSave(){

    if(profile.autosave.enabled){
      autoInterval = setInterval( function(){
        // firefox barfs if I don't pass in anon func to setTimeout.
        saveFile()
      }, profile.autosave.interval)
      
    }
    else{
      clearInterval( autoInterval )
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
      , md = converter.makeHtml(unmd)
    
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
   * Stash current file name in the user's profile.
   *
   * @param {String}  Optional string to force the value
   * @return {Void}
   */  
  function updateFilename(str){
    // Check for string because it may be keyup event object
    var f
    if(typeof str === 'string'){
      f = str
    }else
    {
      f = getCurrentFilenameFromField()
    }
    updateUserProfile( {current_filename: f })
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

  /**
   * Show the modal for the "About Dillinger" information.
   *
   * @return {Void}
   */  
  function showAboutInfo(){

    $('.modal-header h3').text("What's the deal with Dillinger?")

    // TODO: PULL THIS OUT AND RENDER VIA TEMPLATE FROM XHR OR STASH IN PAGE FOR SEO AND CLONE
    var aboutContent =  "<p>Dillinger is an online cloud-enabled, HTML5, buzzword-filled Markdown editor.</p>"
                      + "<p>Dillinger was designed and developed by <a href='http://twitter.com/joemccann'>@joemccann</a> because he needed a decent Markdown editor.</p>"
                      + "<p>Dillinger is a 100% open source project so <a href='https://github.com/joemccann/dillinger'>fork the code</a> and contribute!</p>"
                      + "<p>Follow Dillinger on Twitter at <a href='http://twitter.com/dillingerapp'>@dillingerapp</a></p>"
  
    $('.modal-body').html(aboutContent)

    $('#modal-generic').modal({
      keyboard: true,
      backdrop: true,
      show: true
    })
    
  }
  
  /**
   * Show the modal for the "Preferences".
   *
   * @return {Void}
   */
  function showPreferences(){

    $('.modal-header h3').text("Preferences")
    
    // TODO: PULL THIS OUT AND RENDER VIA TEMPLATE FROM XHR OR STASH IN PAGE FOR SEO AND CLONE
    var prefContent =  '<div>'
                          +'<ul>'
                            +'<li><a href="#" id="paper">Toggle Paper</a></li>'
                            +'<li><a href="#" id="reset">Reset Profile</a></li>'
                          +'</ul>'
                        +'</div>'
  
    $('.modal-body').html(prefContent)

    $('#modal-generic').modal({
      keyboard: true,
      backdrop: true,
      show: true
    })
    
  }
  
  
  /// UI RELATED =================

  /**
   * Toggles the paper background image. 
   *
   * @return {Void}
   */  
  function togglePaper(){
    
    $preview.css('backgroundImage', !profile.showPaper ? 'url("'+paperImgPath+'")' : 'url("")'  )

    updateUserProfile({showPaper: !profile.showPaper})
    
    Notifier.showMessage(Notifier.messages.profileUpdated)

  }
  
  /**
   * Toggles the autosave feature. 
   *
   * @return {Void}
   */  
  function toggleAutoSave(){

    $autosave.html( profile.autosave.enabled ? '<i class="icon-remove"></i>&nbsp;Disable Autosave' : '<i class="icon-ok"></i>&nbsp;Enable Autosave' )

    updateUserProfile({autosave: {enabled: !profile.autosave.enabled }})

    autoSave()
  
  }


  /**
   * Bind keyup handler to the editor.
   *
   * @return {Void}
   */  
  function bindFilenameField(){
    $('#filename > span[contenteditable="true"]').bind('keyup', updateFilename)
  }

  
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
    
    $theme
      .find('li > a')
      .bind('click', function(e){
        changeTheme(e)
        return false
      })

    $('#clear')
      .on('click', function(){
        clearSelection()
        return false
      })

    $("#save_dropbox")
      .on('click', function(){
      profile.current_filename = profile.current_filename || '/Dillinger/' + generateRandomFilename('md')

      Dropbox.putMarkdownFile()

      saveFile()
      
      return false
    })

    $(".modal-body").delegate("#paper", "click", function(){
      togglePaper()
      return false
    })

    $("#autosave")
      .on('click', function(){
        toggleAutoSave()
        return false
    })

    $('#reset')
      .on('click', function(){
        resetProfile()
        return false
      })

    $import_github
      .on('click', function(){
        Github.fetchRepos()
        return false
      })

    $('#import_dropbox')
      .on('click', function(){
        Dropbox.searchDropbox()
        return false
      })
    
    $('#export_md')
      .on('click', function(){
        fetchMarkdownFile()
        $('.dropdown').removeClass('open')
        return false
      })

    $('#export_html')
      .on('click', function(){
        fetchHtmlFile()
        $('.dropdown').removeClass('open')
        return false
      })

    $('#preferences').
      on('click', function(){
        showPreferences()
        return false
      })

    $('#about').
      on('click', function(){
        showAboutInfo()
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
     saveFile(true)
     e.preventDefault() // so we don't save the webpage - native browser functionality
    })
    
    var command = {
       name: "save",
       bindKey: {
                mac: "Command-S",
                win: "Ctrl-S"
              },
       exec: function(){ 
         saveFile() 
       }
    }
    
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

tmpfiledataset = {"id":"912cbdad-abe7-ee97-2962-faf7f5fa92ca","name":"node-git","type":1,"children":[{"id":"21c09214-3975-e427-3a94-dd16535cac73","name":".git","type":1,"children":[{"id":"c825656b-3c38-d4e5-372e-9e6aa25320c6","name":"COMMIT_EDITMSG","type":2},{"id":"4cc20c0c-a0bb-b877-bcc6-72036e02403e","name":"config","type":2},{"id":"c794df7a-7df4-63c4-b32b-dd5a1185b244","name":"description","type":2},{"id":"10595ffd-bfac-18cf-f934-0dc80e4b88d0","name":"FETCH_HEAD","type":2},{"id":"e71b50b0-1bc2-8108-1503-a7bc146a571b","name":"HEAD","type":2},{"id":"43ebc154-f19c-2256-144a-b0dcfe43cef3","name":"hooks","type":1,"children":[{"id":"5c25a9cf-12c1-0d2f-fb31-f666d3783ab9","name":"applypatch-msg.sample","type":2},{"id":"94880129-db70-0ab0-f62e-5e438cbe1186","name":"commit-msg.sample","type":2},{"id":"30bcb826-f602-9781-2f30-854db7e4dc1d","name":"post-update.sample","type":2},{"id":"5681202f-1d66-0b8f-a752-f4d9f8cfa4f4","name":"pre-applypatch.sample","type":2},{"id":"09daad27-60c7-af2c-7c37-5ab4afef9208","name":"pre-commit.sample","type":2},{"id":"5619890b-aa33-b9c8-d9cc-b7f73fe0c2e0","name":"pre-rebase.sample","type":2},{"id":"36d64596-14ae-07a5-550f-5b5b119aec12","name":"prepare-commit-msg.sample","type":2},{"id":"38d3431c-2b52-ac09-2ed4-aea2be76f4ce","name":"update.sample","type":2}]},{"id":"94df6527-a33a-b50d-1e26-8847a6c98b7c","name":"index","type":2},{"id":"daa48581-793e-9ca6-bf54-f998d6b76c67","name":"info","type":1,"children":[{"id":"11243fa5-9deb-94c9-cb32-da60b9854ab0","name":"exclude","type":2}]},{"id":"16983daa-0ccf-9056-d8a0-5ff6f20377d3","name":"logs","type":1,"children":[{"id":"9636d36d-67f7-1c42-49dd-92b4e146349c","name":"HEAD","type":2},{"id":"9bcbfb9d-64f4-e6f3-25b7-400f39339bd0","name":"refs","type":1,"children":[{"id":"ccdc0323-7dc6-7696-4837-6d0f4fd32573","name":"heads","type":1,"children":[{"id":"c0c5577e-2682-99f8-091c-c1f118f14ade","name":"dev","type":2},{"id":"e0f2d86e-ccde-1fb5-167c-86c340192439","name":"master","type":2}]},{"id":"53187149-85ec-1f8f-b1b0-e83314f483fa","name":"remotes","type":1,"children":[{"id":"7283a39c-9aa9-a9c0-54e7-203140a3345e","name":"origin","type":1,"children":[{"id":"2583d5f2-439f-36ff-cc59-a7c52957dc3c","name":"master","type":2}]}]}]}]},{"id":"afd1a026-b3e2-7174-0f70-f73bbfe74515","name":"objects","type":1,"children":[{"id":"9c40c338-c818-a827-9efa-47ca971b2e90","name":"00","type":1,"children":[{"id":"1e1ae68c-fa86-6188-94e0-83773338f12f","name":"306c5ece2ac70135dc07562a15e73ce14fd075","type":2},{"id":"ba175f97-6c80-419d-696e-352265e846d2","name":"a3e30a0caf37c080c805e15ff58371d1186d60","type":2}]},{"id":"e452e25f-fe10-395b-c267-8a051dba5f5d","name":"13","type":1,"children":[{"id":"38a0e38a-f0c5-aaa4-b1be-2bd257af4726","name":"6f87372da7581073ba963706af4dc3c0c6d152","type":2}]},{"id":"107a63c9-58ee-24ee-0722-e4ceceaaacd6","name":"16","type":1,"children":[{"id":"f01dc3bb-426e-03aa-a21e-9fc99e251749","name":"d4d317167dfaf03fea74482e27f8b3bceea94d","type":2}]},{"id":"9d27adbe-6e85-5a9e-89c7-4c393dcb4f41","name":"1a","type":1,"children":[{"id":"038e1e76-ec7a-a6e0-c398-00ae2bb6b0ef","name":"a878e28f49aebfddbf69702a6d579a65bf1dc0","type":2}]},{"id":"3f260822-1793-c7d0-76da-40c79d8b9b32","name":"27","type":1,"children":[{"id":"3431b2b6-0d11-7133-ccfa-8a27ad68156b","name":"962f1ec3d1225285d5c726ce32e286840dbce2","type":2}]},{"id":"48748fcd-ce5d-e76d-7cdc-e8d35b79cdb3","name":"2c","type":1,"children":[{"id":"726a95d7-fbb3-0288-ac55-4e1329a6b221","name":"0fb5b7dbb5960441251f4ff7206de94e6906f9","type":2}]},{"id":"54ce1209-24ad-f76d-1000-90b2b5eaa5e0","name":"2d","type":1,"children":[{"id":"4189ec06-46dc-3e92-dc04-2a5e74fe983a","name":"9949e18bdc403c0d08c4bc2416f3e8aa6fcfe2","type":2}]},{"id":"40ea8122-7114-4ec3-3da9-d516bd75d411","name":"36","type":1,"children":[{"id":"7a9c84e1-f75f-1fd5-5c03-33a350ab07e9","name":"23930b92213faf6056b9c1e23ec3476bcb763d","type":2}]},{"id":"a91eeebf-7374-a627-7dfe-8ed004e2c77a","name":"38","type":1,"children":[{"id":"2facc642-72ee-af52-ba46-20a87925f320","name":"94ea540db5831aaf11b7e267d2a71406e2a6bc","type":2}]},{"id":"1989e409-9ec7-43db-7748-f18732ba29da","name":"3c","type":1,"children":[{"id":"65ea7305-b09f-937b-d9b8-84c666fa9f26","name":"009297d3a59a8784fe1ef79c052e1aa7c0dfa4","type":2}]},{"id":"f734d0a3-f190-c25f-5eab-3651261561f3","name":"3d","type":1,"children":[{"id":"17290b50-5c15-566f-68ea-de29a26be9d3","name":"02fc506d31af5a9bf9944926145f473e926dd5","type":2}]},{"id":"b51ae399-e8f1-b1cf-482f-90197bff556e","name":"41","type":1,"children":[{"id":"c970d345-a850-10a0-291d-14de3e34bc26","name":"9cdabb393f19f412b2db2d14eea86c5b704733","type":2}]},{"id":"d6fb8693-84d2-ba30-993d-79818c3f0936","name":"4a","type":1,"children":[{"id":"7ae07174-3514-92ad-f9ac-bd3f64bb5c05","name":"99ca196a3d1e104ae788fdcb00b5344bc82478","type":2}]},{"id":"e773862a-e33b-2952-16ac-fd7b86f2ad25","name":"4e","type":1,"children":[{"id":"5ff5f7be-f1ef-4a48-26ea-3c7789df83aa","name":"a58e41fcb0a070f6648afd4293f5f8cab340d2","type":2}]},{"id":"8c2b66a0-0605-8021-4707-88db43d071d7","name":"54","type":1,"children":[{"id":"e3ef1e53-ebe0-e05a-d943-4240a14f7ce7","name":"6bfd172b111fd359463da093788df4cf4f53e2","type":2}]},{"id":"45d4124f-a509-c839-e517-772fc69ff832","name":"5b","type":1,"children":[{"id":"6680decb-85bd-a032-363c-39b86718b20c","name":"2a1c52b908c54c9ac4e048b1b8f40bac89a4e6","type":2}]},{"id":"674b6526-a85b-5c4e-54f6-331baa8a8462","name":"5c","type":1,"children":[{"id":"d1281c7a-cee0-8372-085e-c1aa9437a2f0","name":"5907e667683e5fd348a80cd29b5ee3d1f1e94e","type":2},{"id":"d8c2631c-06ab-b635-f793-e8fd8cd32503","name":"8271fb8a45dc5d0892f6cfa5ade6a4293a3bfe","type":2}]},{"id":"e4e4d5a3-83e6-bb6f-9cb5-4e064fd5bd66","name":"68","type":1,"children":[{"id":"034ecffd-cfb8-cba5-e987-d72d2af0ed3f","name":"940ff8e0673c246b30fb9f7a93b4de9b56995c","type":2}]},{"id":"7452c78d-d07c-1655-fbf6-9f3a01e04fd5","name":"6d","type":1,"children":[{"id":"3d189cfa-e4d9-1b77-c0eb-6a058add0965","name":"82797d37f26c90e03c6f81f7dc6c32551f5c31","type":2},{"id":"bf2c5029-ddb3-d87e-8f97-c462f38199a6","name":"e345eff14282b45fdb849dd82da77618a5f8ca","type":2}]},{"id":"e21a1728-0b5c-6d40-c4ba-5b43f0e1e203","name":"6f","type":1,"children":[{"id":"5ab496c8-6ec8-f0c1-d7a4-375c2b3c7492","name":"4c0772a3c5d176df82468fd91d8f0a478c146c","type":2}]},{"id":"1c274311-1229-c47b-57c4-8863e4dbce57","name":"70","type":1,"children":[{"id":"2f2de225-7be3-20c7-3030-65cc76d2ea6e","name":"a7c8fc26f1849c14e39f98385136ae4895790a","type":2}]},{"id":"bcfde79f-2d42-de74-b0bc-f14a6a7dc042","name":"71","type":1,"children":[{"id":"72dcf036-0543-8efd-811e-fe408c1a2ac4","name":"4c01168037b0668307c2c272e60945f33c0c54","type":2},{"id":"4c43fef0-ef72-625e-cba1-89d676ba1fb0","name":"ee4f69cd9f7950e6629d3857eba2ed3279eb0d","type":2}]},{"id":"75e2b669-e3d4-38f6-d936-c1351d46cf6a","name":"7a","type":1,"children":[{"id":"21a3c28a-3a00-b356-879e-e6de4e40907d","name":"0ecb1ce3082ee95eba47f72555f3f6e629907c","type":2}]},{"id":"a6f696c0-137d-19e2-16ff-5327ae20063e","name":"8a","type":1,"children":[{"id":"66d4bfc9-428b-06b2-b2a2-1395735a1756","name":"93a3aad086cebd9b9f82ca20c2f6d6c46208f7","type":2}]},{"id":"bfe84e0c-be8c-ea5b-6cc6-16b615c8fad3","name":"8f","type":1,"children":[{"id":"581eafa4-cb95-dbc2-320e-1cc3448fa6eb","name":"4030a44bd476cd665b92cc3458f04850198cb5","type":2}]},{"id":"3adda398-2643-247c-1df6-7ab2801ccd24","name":"92","type":1,"children":[{"id":"3263016a-fd37-2bdb-5a37-5418bda5ee96","name":"2003b8433bcad6ce9778a37628d738faa26389","type":2}]},{"id":"402ebcbc-ce12-9f77-a9a3-9978b2b6be3c","name":"94","type":1,"children":[{"id":"46e1612c-df9c-fffd-8ab2-599bdd9612b1","name":"7d2557e2f603980cd1c156aa1e8372f4d3737d","type":2}]},{"id":"5e2fef43-5047-12f3-1ab4-9294a09e9274","name":"97","type":1,"children":[{"id":"6ec2316e-0256-ca61-0046-2e3205cdc158","name":"c0809c53d0b8ee0da4dac10c3c6fdf6e33849c","type":2},{"id":"03fbfbcc-8af6-3c59-7df2-bf8a6a8fb736","name":"e41f94930593afe3d4be947a997f409293ba3a","type":2}]},{"id":"df7f2bd9-8da2-4e7c-eaf6-2c0640930f29","name":"9f","type":1,"children":[{"id":"35b8c656-851a-bb90-acd9-1a23a8c5d58f","name":"d7c3a54d265f0c8b3a38acbb92f2defdb75a9f","type":2},{"id":"747c1775-88a7-c284-03ad-070a89d6bcd4","name":"f9a3a62c88fd732ef9cf41ee4d215b6de390c4","type":2}]},{"id":"5e2a8447-c990-de4f-3213-7083c49a04f9","name":"a0","type":1,"children":[{"id":"63df71e1-691a-b314-516f-8424b63120ba","name":"36d774f73a00668339f916baf0616d80b5b5bb","type":2}]},{"id":"a0841ad7-ff67-0fc0-3796-55013a093ae4","name":"a1","type":1,"children":[{"id":"5533aeff-c93e-6660-c1e5-5d7eb434e2b3","name":"921a1104be542ca211b55769054908f62aed98","type":2}]},{"id":"eb3a3948-17bc-d8fa-08e3-a78a915411b9","name":"aa","type":1,"children":[{"id":"587b44de-88f7-a092-6cc0-3dd557a822fd","name":"aabe41b457604a0174dd09d79bb306b92ccefb","type":2}]},{"id":"0866cff7-dd7e-5ee9-875e-f7155ac91838","name":"b4","type":1,"children":[{"id":"d4b6007e-bc73-a908-fec1-ee7ffa79edac","name":"aced1fca23e44b5200a5d97dfc8955162eb08f","type":2},{"id":"48047fd0-3f74-729d-3b6e-50829b8a4ed2","name":"def60d9f5e9450e289f7533a330a90e001248e","type":2}]},{"id":"e341e9d9-140e-2dc0-8980-cd0a3c861c6b","name":"b7","type":1,"children":[{"id":"ac48c736-0f5f-69b9-5e16-afa99d335475","name":"5d73536c178bafdb9a493d5367a822d122fe39","type":2}]},{"id":"29a272b6-7533-972b-e6d1-6b49c882c491","name":"b9","type":1,"children":[{"id":"e2793510-d064-3c65-a276-922dfc98db49","name":"cab853b96faa144f2a8008a3fd643d630caa05","type":2}]},{"id":"4d588423-61ff-ada0-00a9-e4606891ff7d","name":"c7","type":1,"children":[{"id":"35e95387-4595-75e7-498f-a4c43b19520e","name":"152a13938bc00f30154861758d0adf8a57b7d2","type":2}]},{"id":"943f063a-a17d-15b8-2860-3fff0a0d5815","name":"c8","type":1,"children":[{"id":"8ab218ef-d065-7bf1-bbbf-beed91a05ae1","name":"0f2198b5f6863fd489ec8ac6c40a50ac1f7b30","type":2}]},{"id":"89554d93-39da-538a-ab94-4d276ddc5631","name":"ca","type":1,"children":[{"id":"3637e3e0-4a15-6795-1fbd-1196e19f7015","name":"6537212f333cdb567219903b2e196ba3fd292c","type":2}]},{"id":"decb2904-7993-2439-74f8-31a0e32d3c49","name":"cb","type":1,"children":[{"id":"fcc62586-3d30-5420-cce6-47b2cf22c0f6","name":"2b7ded38cc4d00b80f24382ca067f657a8f58e","type":2}]},{"id":"65e6df0a-5dd4-933b-31c4-9c06444d15d8","name":"cd","type":1,"children":[{"id":"7d99a862-a454-e590-4db6-92bdbdf95a0a","name":"9d8d4711acf0c348582e5565a18bb9d8e990ce","type":2}]},{"id":"a33a2edb-ab7e-561e-bf81-18c4e7ff46ec","name":"d1","type":1,"children":[{"id":"fae4edba-4773-8ecb-7eed-96ec46cf395c","name":"82dbbd369826a9e8e4e17167050d8ffc946af4","type":2}]},{"id":"41c38881-cad8-659c-aad3-70365c4116a1","name":"d7","type":1,"children":[{"id":"e8a9f41e-4067-0244-db92-85e3022b67b7","name":"00eeddc62a779e6b1c8850e568710ab2e5347b","type":2}]},{"id":"74bb0ccc-ff17-cf5f-f637-2f861735d8e5","name":"da","type":1,"children":[{"id":"45ca5052-1263-8914-373e-a61d55dcfdc6","name":"06744e1b50a40f83d8272a964c610a626d91cf","type":2}]},{"id":"81fc5c7d-fa00-25a3-0b09-ac3e34473304","name":"de","type":1,"children":[{"id":"25dfe77f-28d5-ba6a-287c-83e6c0af6155","name":"9fc2f4935bce657bd9985178204ccaaa25770f","type":2}]},{"id":"b77c4f96-9151-46bf-7a5a-13fd513925a3","name":"e2","type":1,"children":[{"id":"58e173af-cc05-ff50-900f-740964c04d1b","name":"06d70d8595e2a50675ba11de48efcfa012497d","type":2},{"id":"136a6b99-a029-9ab1-195a-09c97b3d89b6","name":"17802a41e0d42dfc7e30eacead4408e98eca3e","type":2}]},{"id":"bb92726c-3163-3fc0-0a75-c8a80645c147","name":"e3","type":1,"children":[{"id":"6a5e49d6-ea5f-b74b-96b5-f5074ab0eb7a","name":"bcaa51508ec9ef9225653c7903016e0d731b2c","type":2}]},{"id":"d54eea8a-5863-5350-e784-0ba5de539db7","name":"e9","type":1,"children":[{"id":"e81b7025-eb9b-0168-8497-fe0291222709","name":"3765a851d56ebefeaba6ad99dd949b997014d5","type":2}]},{"id":"2a823a52-77dc-8c2c-ce67-d3e38208a95c","name":"ef","type":1,"children":[{"id":"b383d354-304a-014d-1082-c0dc5bf8c09c","name":"b94f6d9bbc3ff26aa1142f7a051796a97ea02f","type":2}]},{"id":"3f89717d-9518-b3e5-c796-40ed0513ea14","name":"f1","type":1,"children":[{"id":"7efe4a24-0f14-811c-45aa-ab1ff1569dc9","name":"066ea6a49e1f6da439d3f7f79d3897b83a1e9a","type":2}]},{"id":"e0632236-1d31-b649-6dbc-f89fd5b534fc","name":"f4","type":1,"children":[{"id":"331554c1-1925-cfcf-2612-16049628e2b2","name":"3af4d6a9620f3d4fe4fdecf31d3c6108d7f447","type":2}]},{"id":"0cb50d41-102c-585f-5220-d6c5dda1f935","name":"f5","type":1,"children":[{"id":"92389732-e8bd-407a-ebe7-13104a3d665d","name":"dffe7523d35e3819cc066665508086313b836e","type":2}]},{"id":"fde10dd3-eb38-da3c-ee56-81c167ece278","name":"f6","type":1,"children":[{"id":"c200608b-acb1-eb75-680b-a4af3317eaa3","name":"078109d649bb4aa7d4bea11fa6edd66adc92db","type":2}]},{"id":"fff1e7ac-869f-9478-8e68-f9e5f9dfd6a3","name":"info","type":1,"children":[]},{"id":"c70f70ed-589f-c872-7ed7-07c12f6f239e","name":"pack","type":1,"children":[]}]},{"id":"4c4114f8-e741-5db8-fc71-feba121c4709","name":"ORIG_HEAD","type":2},{"id":"c363f504-8103-57c5-0453-af141c6a84d8","name":"refs","type":1,"children":[{"id":"a2132f8e-0540-d0af-b918-43166d464b04","name":"heads","type":1,"children":[{"id":"497bbddc-8f06-ef9d-f913-ceca338dd16b","name":"dev","type":2},{"id":"c62a602b-fb51-2f32-accb-76c428c5193f","name":"master","type":2}]},{"id":"dfb4c0b6-806d-0b46-c17e-08fa75c47665","name":"remotes","type":1,"children":[{"id":"315a4d34-0f66-ca1c-43af-861063def546","name":"origin","type":1,"children":[{"id":"7fd86369-3085-f60c-82da-75fe11e6b30b","name":"master","type":2}]}]},{"id":"7b019ec4-14bb-c69f-a734-cba34f770407","name":"tags","type":1,"children":[]}]}]},{"id":"22c1cb45-5ffd-2953-15c7-94f3ba8d8bfc","name":".gitignore","type":2},{"id":"96d44025-6f69-8712-3c23-9840ef2de4e9","name":".idea","type":1,"children":[{"id":"d24d42a2-f8a9-45ed-9e8b-3958adf46127","name":".name","type":2},{"id":"145d8b7c-7c49-f62f-b9a3-f72f7321f54b","name":"encodings.xml","type":2},{"id":"7dec58b0-65d1-1c8b-fd27-524b4f8f2838","name":"jsLibraryMappings.xml","type":2},{"id":"7058dc95-a630-e82d-892c-e2bf737b72c4","name":"libraries","type":1,"children":[{"id":"f42ef4fa-9af8-91d3-8301-39d1ce316717","name":"sass_stdlib.xml","type":2}]},{"id":"c99c5267-b065-4c91-4325-53d485be9d27","name":"misc.xml","type":2},{"id":"2beeaf4e-9acf-3390-f24a-cc4754170751","name":"modules.xml","type":2},{"id":"e91136a5-d087-5853-c425-b81f199ef5eb","name":"node-git.iml","type":2},{"id":"0195d7ce-bc71-38cb-facb-0328a81d450b","name":"scopes","type":1,"children":[{"id":"b9f9d23b-6d8b-68b1-a6c8-3520e842eb60","name":"scope_settings.xml","type":2}]},{"id":"e5118727-c6a6-5b5e-e3b7-1b7238075d2d","name":"vcs.xml","type":2},{"id":"c289c782-e6f9-34d9-8da6-9230f09ed7e0","name":"workspace.xml","type":2}]},{"id":"bc8490ad-f25d-5622-85b5-d4002a8616d2","name":"config.json","type":2},{"id":"728690d8-343e-bad0-bfff-2cb5356f85c7","name":"folder_to_json.js","type":2},{"id":"9a2c6dd8-7801-56a1-de8f-a2e5593b1ff5","name":"local.js","type":2},{"id":"51954112-8e6a-833f-3afb-9dc906c277a9","name":"Makefile","type":2},{"id":"c2634858-5c7a-7edd-12d6-473c66fcbd5a","name":"models","type":1,"children":[{"id":"d4e90da2-0c61-b393-414e-f9692db717ad","name":"ssnau.js","type":2}]},{"id":"cac5f9f6-a477-fa46-0bc7-7045706fb39d","name":"node_modules","type":1,"children":[{"id":"748d8411-8bce-42f6-6e59-1bdd8d731d5d","name":".bin","type":1,"children":[{"id":"b975c39d-58e9-a53c-deb5-1bacf15cb0d3","name":"express","type":2},{"id":"721b98b0-14f9-c0db-ce75-4cf89251cab4","name":"express.cmd","type":2},{"id":"112953c6-96ac-1b27-c7df-119a3fde1793","name":"jade","type":2},{"id":"e9345cd5-d5aa-f863-a304-703d183275ce","name":"jade.cmd","type":2},{"id":"a3d29833-a7dd-6c7c-2668-a75949354ce8","name":"mocha","type":2},{"id":"8c06716a-5e3a-7410-20a8-300abb84ef0b","name":"mocha.cmd","type":2},{"id":"f6f23885-1556-b7f7-bb8a-c134f14f3f0e","name":"vows","type":2},{"id":"219ba69f-a0ef-3f92-79d0-85d96481209a","name":"vows.cmd","type":2},{"id":"af759b1d-16d7-73b7-3c06-1d7b715e2e3b","name":"_mocha","type":2},{"id":"ef1f3944-fb4e-d14f-8ea7-1ed207ad92eb","name":"_mocha.cmd","type":2}]},{"id":"485619b5-cf3b-2fb2-8688-50ae3c8864d0","name":"connect","type":1,"children":[{"id":"dd8f698b-7cc6-c711-9915-d9058bac74b4","name":".npmignore","type":2},{"id":"a0158cbd-35b8-e95c-094f-ecb8262decaf","name":"index.js","type":2},{"id":"99facf20-cc3e-f1bb-4d32-fda8d4a5b88e","name":"lib","type":1,"children":[{"id":"d59207a7-7902-659a-9a2f-5eb389d7b193","name":"cache.js","type":2},{"id":"90747bf5-20aa-1a39-4ace-35b295c4868d","name":"connect.js","type":2},{"id":"551d3082-1bed-041a-b9cc-223959cf75af","name":"http.js","type":2},{"id":"c3d01ef2-264f-9942-383f-8888033a5788","name":"https.js","type":2},{"id":"7fbf8654-c39a-f16f-0829-ae2e43b43c67","name":"index.js","type":2},{"id":"8d147f92-a9d2-75dc-a1e2-5e1d6b9a6d9d","name":"middleware","type":1,"children":[{"id":"aa1ba1a5-ff81-bc94-4d7f-0dccfbec2c47","name":"basicAuth.js","type":2},{"id":"a0a2fe82-4974-fc41-19fb-afc77c83e4e5","name":"bodyParser.js","type":2},{"id":"ee0c1e65-cfd2-c824-3feb-0e1570527066","name":"compiler.js","type":2},{"id":"66c037f7-c691-9fda-9b48-fdf321652cc9","name":"cookieParser.js","type":2},{"id":"79170f35-0919-a16c-6aed-aee553becf02","name":"csrf.js","type":2},{"id":"a2abe188-2ed4-abb2-e7a7-7551dfa05ed4","name":"directory.js","type":2},{"id":"ad036ed4-aee6-54d6-5258-c08d0e2aaad7","name":"errorHandler.js","type":2},{"id":"15f48c7f-36f6-28b8-e472-d7f1172a856f","name":"favicon.js","type":2},{"id":"f05e0de9-ce15-0926-cfcd-15f19cf63955","name":"limit.js","type":2},{"id":"e939cb25-c338-c356-3680-4b2173e3b924","name":"logger.js","type":2},{"id":"daf8ec35-8c73-6187-bd90-ac4e8e906f14","name":"methodOverride.js","type":2},{"id":"e9bd4eea-62c4-68bb-8b18-1150e619f83d","name":"profiler.js","type":2},{"id":"c7d34442-4c96-6008-9a40-977e98afc62c","name":"query.js","type":2},{"id":"4a2f45ef-fca5-4242-39eb-ea26ce417960","name":"responseTime.js","type":2},{"id":"96e469a3-9713-fcf7-6b7f-365f3ad63755","name":"router.js","type":2},{"id":"6515727a-957f-5a5c-c290-cc3a3bc8dacf","name":"session","type":1,"children":[{"id":"a21c177c-1df6-653b-03cc-eb00523e6332","name":"cookie.js","type":2},{"id":"8696c96e-999d-6bfb-2a90-7c399a9ff8a8","name":"memory.js","type":2},{"id":"3ac5c1eb-3326-15cd-9d2d-8f22c6f40b4b","name":"session.js","type":2},{"id":"0484fbf4-7cbc-cce3-475a-10419114afe2","name":"store.js","type":2}]},{"id":"e93d86a1-8310-0c29-48f4-1a05e82cd352","name":"session.js","type":2},{"id":"3ef7e511-9e78-4f0e-ec5c-b673b6a26931","name":"static.js","type":2},{"id":"d6bd737f-9ec6-4829-4997-d30b3501af3f","name":"staticCache.js","type":2},{"id":"03967442-8d41-9e49-aa84-438d260f4e4b","name":"vhost.js","type":2}]},{"id":"420acb7d-9ade-4667-3b10-fcb98b6c8e64","name":"patch.js","type":2},{"id":"b6291e15-1286-4903-c764-67b999de4680","name":"public","type":1,"children":[{"id":"fdb8efa1-ee14-b5a3-298a-123e2713184b","name":"directory.html","type":2},{"id":"7d8ebb93-7ab5-705a-1117-fa0dda695ad8","name":"error.html","type":2},{"id":"33393f15-80dc-68f2-c5a3-7b3671370f5e","name":"favicon.ico","type":2},{"id":"aaf83e1f-c3a8-e849-9587-5d026e126911","name":"icons","type":1,"children":[{"id":"0bebf833-857e-cf09-0f41-9d4a6dc31ad7","name":"page.png","type":2},{"id":"03174cd3-d310-e859-b6a9-4712f6c741ef","name":"page_add.png","type":2},{"id":"4f890624-fac2-72a0-ec91-8775e7b2dbc3","name":"page_attach.png","type":2},{"id":"da7e986c-bf65-fd3c-b3e0-d8f4c3dbbd07","name":"page_code.png","type":2},{"id":"ca598810-7548-d14d-f809-660528122594","name":"page_copy.png","type":2},{"id":"fb09474c-ee6f-09de-3862-db706178c896","name":"page_delete.png","type":2},{"id":"c07d1877-4639-316b-7a21-be61e7835f07","name":"page_edit.png","type":2},{"id":"abd3289a-00e2-eb46-1d55-f7fba5c055fd","name":"page_error.png","type":2},{"id":"d7f4dd9d-d057-24af-73dd-fbf959e8637f","name":"page_excel.png","type":2},{"id":"366d07e2-dd82-8c06-34d5-c1d5c1989f6d","name":"page_find.png","type":2},{"id":"5f770ddf-dbe6-89e3-1b30-6a6c02d50dd8","name":"page_gear.png","type":2},{"id":"03f37cdf-7f87-8249-9fa0-a9d190a3dbfa","name":"page_go.png","type":2},{"id":"acfee573-5dd3-dc65-50ad-0d1725d536d4","name":"page_green.png","type":2},{"id":"1ff67759-33b9-d3d9-1034-18540b6fef4f","name":"page_key.png","type":2},{"id":"a3962307-1ce2-cd19-3b14-0415ab232041","name":"page_lightning.png","type":2},{"id":"63b076b5-2165-83fd-81a6-0a68dbb7c755","name":"page_link.png","type":2},{"id":"1a8f6200-1ef0-526d-b02c-4448041e53ce","name":"page_paintbrush.png","type":2},{"id":"5cd540f2-cf49-f814-ac29-65e3bbbbb348","name":"page_paste.png","type":2},{"id":"533f8acb-33c1-ccec-c742-5f2c4166fe09","name":"page_red.png","type":2},{"id":"603545ef-3852-87fa-954b-bcf38302e674","name":"page_refresh.png","type":2},{"id":"e8aaf889-0b31-d8a8-049e-98bf13492980","name":"page_save.png","type":2},{"id":"8c6f1f92-a1a8-d2b4-a087-0512286f347e","name":"page_white.png","type":2},{"id":"cf2aa917-8be0-ab54-ddd6-256a42412198","name":"page_white_acrobat.png","type":2},{"id":"e33a30f7-0693-afc1-47bd-316598bcb4b3","name":"page_white_actionscript.png","type":2},{"id":"5c591059-d6ca-0c7e-d7cc-a1f5a1f0d4ce","name":"page_white_add.png","type":2},{"id":"d7feb8eb-dcc2-ff18-c1fa-ce1adbf6593c","name":"page_white_c.png","type":2},{"id":"acc7b289-496c-cfb9-dbaa-e182809a11b9","name":"page_white_camera.png","type":2},{"id":"41f99dc2-a9fd-1c2a-f28e-6dfa0b8affa8","name":"page_white_cd.png","type":2},{"id":"dd90ffc8-63a7-4478-2d47-5d3c8ed30769","name":"page_white_code.png","type":2},{"id":"f1ed191f-43ae-e378-721e-4769fbc5866e","name":"page_white_code_red.png","type":2},{"id":"2c375130-7475-7024-4845-d5a7ab49a008","name":"page_white_coldfusion.png","type":2},{"id":"0de23548-67de-f7b1-425a-fb78f4d1d53e","name":"page_white_compressed.png","type":2},{"id":"05d9cb8b-dc74-d37d-9863-7092810ffca2","name":"page_white_copy.png","type":2},{"id":"2362a709-5346-e61a-5203-0050417f299e","name":"page_white_cplusplus.png","type":2},{"id":"c126bda1-60b9-90c1-36cf-eabc8e6153d3","name":"page_white_csharp.png","type":2},{"id":"d66e9c25-765b-12dc-3886-0b47bf48f56e","name":"page_white_cup.png","type":2},{"id":"6744075f-0b42-2901-2114-6d90191924f3","name":"page_white_database.png","type":2},{"id":"a19ab133-0e67-01e8-7455-7fc4bdba46f9","name":"page_white_delete.png","type":2},{"id":"dc949aa5-8a43-91ab-810e-17b346e61489","name":"page_white_dvd.png","type":2},{"id":"8175beaf-dea5-7100-4054-eabe1fca1d74","name":"page_white_edit.png","type":2},{"id":"5dd14b6a-fd32-5eae-bd75-a1358314e386","name":"page_white_error.png","type":2},{"id":"a0a34372-bfc4-1b29-73ef-fe23d1d69ea9","name":"page_white_excel.png","type":2},{"id":"e168536e-11dd-9840-30f1-0fdb7369fd9a","name":"page_white_find.png","type":2},{"id":"1bae05a4-9503-023e-2333-466cefd48210","name":"page_white_flash.png","type":2},{"id":"39bb6434-21f4-938c-4583-94c90018c8be","name":"page_white_freehand.png","type":2},{"id":"3dbbfbe9-6380-aafd-f004-5fadd367d02d","name":"page_white_gear.png","type":2},{"id":"248eb190-32ff-f5c2-8849-f4bd0fb582d9","name":"page_white_get.png","type":2},{"id":"9528d593-8c88-4806-cfcc-bc65d7d6aea5","name":"page_white_go.png","type":2},{"id":"a00afcf8-a386-578f-dbcc-ff2c3d472461","name":"page_white_h.png","type":2},{"id":"c0d9b53e-76c0-90ad-7f83-db8a02b6f9e4","name":"page_white_horizontal.png","type":2},{"id":"5605e30f-e912-f700-3002-51301c489062","name":"page_white_key.png","type":2},{"id":"47541766-f42a-f388-be51-103841b1fb4e","name":"page_white_lightning.png","type":2},{"id":"68964716-2236-51d5-cc68-01a0a7df0cf8","name":"page_white_link.png","type":2},{"id":"878ec585-1485-873e-d287-30cbbd401ae1","name":"page_white_magnify.png","type":2},{"id":"2a6a9180-3f2c-16b8-cd5a-f99a9340e5c6","name":"page_white_medal.png","type":2},{"id":"2d8dfce3-3767-6a79-80c4-470a7102a4d0","name":"page_white_office.png","type":2},{"id":"4569eeab-2f27-2d0b-552d-8d9c3c7df98e","name":"page_white_paint.png","type":2},{"id":"2fd59050-0095-48a1-a4cc-c3686234f798","name":"page_white_paintbrush.png","type":2},{"id":"a18910f7-b092-13ea-5b87-eae09c165f3a","name":"page_white_paste.png","type":2},{"id":"ab6dc9da-2be0-102e-849a-c66bd573ae24","name":"page_white_php.png","type":2},{"id":"59efe20d-0c40-defe-a4e6-bbf1a9759873","name":"page_white_picture.png","type":2},{"id":"b7396930-0c6e-1f7a-a300-6f7706d9e650","name":"page_white_powerpoint.png","type":2},{"id":"f1eff7dc-2a72-1053-1c98-de75e19e61d4","name":"page_white_put.png","type":2},{"id":"5f54b75a-8cc7-41b5-29b4-1912befc6f43","name":"page_white_ruby.png","type":2},{"id":"caa88b27-4975-f99b-fd3c-8e91f0b66447","name":"page_white_stack.png","type":2},{"id":"9581af9f-77ce-7e32-48f7-1b9f80e65e63","name":"page_white_star.png","type":2},{"id":"c33c7b24-3002-ab91-13e1-fb68d133194a","name":"page_white_swoosh.png","type":2},{"id":"b4c53da0-c858-13c7-1120-50cd9cdb21e9","name":"page_white_text.png","type":2},{"id":"15428929-2b04-6b13-1471-a4ecb2d406c7","name":"page_white_text_width.png","type":2},{"id":"9b0a1887-6a79-5479-868d-adfcb1b8273f","name":"page_white_tux.png","type":2},{"id":"53e3771f-ab28-4c00-b010-d34459da58d1","name":"page_white_vector.png","type":2},{"id":"8919c7cd-0deb-7539-6ebc-dc673d5d2501","name":"page_white_visualstudio.png","type":2},{"id":"27f4eb9e-2e7a-3703-72b9-07b0038b69e8","name":"page_white_width.png","type":2},{"id":"759aed59-9374-e528-a2d5-68191e85cc22","name":"page_white_word.png","type":2},{"id":"5cf3e38e-e90e-fd4f-a0a2-747ff0afe644","name":"page_white_world.png","type":2},{"id":"a50e683a-647a-e8fc-9f87-cdfb74fcb401","name":"page_white_wrench.png","type":2},{"id":"d49f9e86-9cd7-0839-8994-fced8c19f4db","name":"page_white_zip.png","type":2},{"id":"d93478b0-f87f-222d-dd35-2d048037f755","name":"page_word.png","type":2},{"id":"b423e516-0059-04ef-98e7-f32587470440","name":"page_world.png","type":2}]},{"id":"4c726e68-e21e-16c8-4d28-1a85e765c220","name":"style.css","type":2}]},{"id":"b91f565d-d742-71cc-433f-9e130a8194bc","name":"utils.js","type":2}]},{"id":"8542b130-bf1e-383f-162f-039337bcc653","name":"LICENSE","type":2},{"id":"fd146af9-8065-3542-c9ab-4957e95fe4e9","name":"node_modules","type":1,"children":[{"id":"714bf5f4-f5aa-4314-b3b4-f54ebf4acb9c","name":"formidable","type":1,"children":[{"id":"a9e95fd5-2e64-6a9f-87e6-21950ea82f05","name":".npmignore","type":2},{"id":"37fce038-8572-ecb9-7e55-aeebcfe6f542","name":".travis.yml","type":2},{"id":"cdfe9890-b3b6-adbf-ce0a-721bb8dbeae2","name":"benchmark","type":1,"children":[{"id":"b61df758-39e7-8235-0a77-1c68a48038bd","name":"bench-multipart-parser.js","type":2}]},{"id":"1eaafe1b-37a5-909b-8cc9-1ee40bf98f1f","name":"example","type":1,"children":[{"id":"b67bd7ac-1ac4-1bce-0012-e8e307f75b76","name":"json.js","type":2},{"id":"a7050fdd-1140-778a-0eb7-75abd8bdfd46","name":"post.js","type":2},{"id":"2b829b58-891a-456a-e6f1-abad03aa9bc5","name":"upload.js","type":2}]},{"id":"be9ae756-af5b-bc89-ea45-027ea827c119","name":"index.js","type":2},{"id":"f99a541f-48d2-8f84-1468-505b2dcb75f3","name":"lib","type":1,"children":[{"id":"65ee4c89-7045-e1e2-5c8f-3d420f0eb93a","name":"file.js","type":2},{"id":"db069e05-d09d-08bb-4882-f07a60770263","name":"incoming_form.js","type":2},{"id":"d6d0c6b8-883c-a0ec-a857-4f741233207d","name":"index.js","type":2},{"id":"3b28c6ed-ee61-7bb0-2165-baecfa9b8fb6","name":"json_parser.js","type":2},{"id":"48c7a0d0-4b20-b534-85f7-55856b76a8f6","name":"multipart_parser.js","type":2},{"id":"070922fc-1599-dd45-9f92-116bc096d7b0","name":"octet_parser.js","type":2},{"id":"ff625c70-23d4-b4cf-51bb-a3949de0db32","name":"querystring_parser.js","type":2}]},{"id":"fec03833-2898-876b-7607-a76e5e0f08ee","name":"LICENSE","type":2},{"id":"a8473219-e3db-4f1d-1c8a-08a8d5c6d338","name":"package.json","type":2},{"id":"6b3bff6e-e44a-dad2-9b8d-811161d5d32a","name":"Readme.md","type":2},{"id":"639750b8-d8e4-3226-bb35-a1502d60934b","name":"test","type":1,"children":[{"id":"52f1573e-3b50-210b-13f3-b5e9ca782ad1","name":"common.js","type":2},{"id":"b63284ba-5dbf-0a28-d5c5-33075e91a4a3","name":"fixture","type":1,"children":[{"id":"fb98c6d0-fc35-614d-45ac-bfc5750238a0","name":"file","type":1,"children":[{"id":"bfb7d172-bd34-8fba-1fa4-958eada5defe","name":"beta-sticker-1.png","type":2},{"id":"2b211c14-17eb-d9d0-cc0a-e013282eab26","name":"binaryfile.tar.gz","type":2},{"id":"dcc48a02-1965-c8c1-7427-d1ee70a78fc0","name":"blank.gif","type":2},{"id":"92dfbc83-dcd6-c933-9785-ab468eb56696","name":"funkyfilename.txt","type":2},{"id":"ae3016a6-e152-7c6b-a103-c760866f64fd","name":"menu_separator.png","type":2},{"id":"7e383d8f-3767-ca0e-7961-06f55e767084","name":"plain.txt","type":2}]},{"id":"d0f86732-f865-b9c0-fbf1-443261f7964b","name":"http","type":1,"children":[{"id":"48e37cec-32af-3f8a-200c-fb835bd13891","name":"special-chars-in-filename","type":1,"children":[{"id":"1ef158b6-9837-f7d3-121b-b65c2814cabc","name":"info.md","type":2}]}]},{"id":"f907c52e-a4a4-7170-350e-c2b64861bb4a","name":"js","type":1,"children":[{"id":"b801dd79-f355-6dd2-8534-897fe56d83f8","name":"encoding.js","type":2},{"id":"2fb88f12-79bf-bae5-fbe5-c8499d3bd212","name":"misc.js","type":2},{"id":"1aae1b97-1547-8138-bcc7-cdaef321a256","name":"no-filename.js","type":2},{"id":"c72748fa-657f-709f-a18b-73ec9b0778d9","name":"preamble.js","type":2},{"id":"d8c85ce2-be8f-653d-ad7d-dfe9feafc372","name":"special-chars-in-filename.js","type":2},{"id":"ebd4449b-4b0c-d265-1660-6d10d6dc1953","name":"workarounds.js","type":2}]},{"id":"38c3eb81-e7a5-105e-7a8b-ea1a75e2dcff","name":"multipart.js","type":2}]},{"id":"47bdd2f1-d0f1-003b-901b-f6b49f083326","name":"integration","type":1,"children":[{"id":"88fceeb0-ad0f-ef7a-aa41-16dd24389527","name":"test-fixtures.js","type":2},{"id":"73d1c8f3-e95f-79bd-fdee-fa860ed480d2","name":"test-json.js","type":2},{"id":"6e06445e-90eb-2c33-5a48-f99aa2894ed7","name":"test-octet-stream.js","type":2}]},{"id":"df075d92-4fea-0def-063f-04a0939c6c07","name":"legacy","type":1,"children":[{"id":"f2ace199-5bcc-a8c2-dc30-098faf7241a5","name":"common.js","type":2},{"id":"ab77c71c-ab9a-5559-e3b8-ba60bcac20d9","name":"integration","type":1,"children":[{"id":"353c149a-5da9-ec41-2174-afc1ba4f6da6","name":"test-multipart-parser.js","type":2}]},{"id":"309f6e49-b289-9139-9f66-db393a32f28c","name":"simple","type":1,"children":[{"id":"3522d384-6f3e-241c-2691-f607628fac8f","name":"test-file.js","type":2},{"id":"82fa4da1-e9db-5567-5f7a-81d17a70dbb8","name":"test-incoming-form.js","type":2},{"id":"99064507-62b8-c610-ddc5-39e4b6c9cd04","name":"test-multipart-parser.js","type":2},{"id":"7931db20-253a-14d9-434c-ee8d1ec1414b","name":"test-querystring-parser.js","type":2}]},{"id":"592b1d6f-6854-c5e8-dbdc-4ca31e8c6a94","name":"system","type":1,"children":[{"id":"6076dd0d-3ae9-c3dd-c680-68d45e29908c","name":"test-multi-video-upload.js","type":2}]}]},{"id":"5d2ba5b0-9110-cde1-ae05-362a03380b0a","name":"run.js","type":2},{"id":"316487cf-7e0e-0e43-c64f-50e9f733140a","name":"standalone","type":1,"children":[{"id":"5b572957-fc75-d81a-0f7e-250703265aa6","name":"test-connection-aborted.js","type":2},{"id":"477acaad-08a5-2484-6296-1e6af5d08d88","name":"test-content-transfer-encoding.js","type":2},{"id":"1d14d010-58a2-47de-1713-e1b593f2c7f0","name":"test-issue-46.js","type":2}]},{"id":"85ab9b30-1003-82a5-ebaf-40e9f1a09f20","name":"tools","type":1,"children":[{"id":"5fbe44c2-80ae-9d46-938f-c1201d0b0e7b","name":"base64.html","type":2}]},{"id":"a1b5b540-4435-cb2b-3b4f-650e6e176524","name":"unit","type":1,"children":[{"id":"690b92b0-1a02-7426-a135-b605aea17918","name":"test-file.js","type":2},{"id":"92d0e6ea-d3c6-19a6-a3b9-bb924425c1f3","name":"test-incoming-form.js","type":2}]}]},{"id":"3b411019-3caf-681d-e3d8-2ecec45d143c","name":"tool","type":1,"children":[{"id":"44476765-3f04-f5a7-a502-37a72a374f5d","name":"record.js","type":2}]}]},{"id":"1a42c861-e58a-81a2-f642-192b856cc190","name":"mime","type":1,"children":[{"id":"65656a6c-5ee7-7922-d521-7427c387e789","name":"LICENSE","type":2},{"id":"fae8ccf5-39cf-1e83-bf3a-96920b1d82fe","name":"mime.js","type":2},{"id":"61d0e00e-3a99-52af-9bcf-68e45713fcc2","name":"package.json","type":2},{"id":"9290f7a9-c5ad-3112-858f-c005784ada0c","name":"README.md","type":2},{"id":"0cb50ad8-0763-4489-b8f8-7113229ffd8f","name":"test.js","type":2},{"id":"771669e7-7223-fba6-d590-3e0a4dcf26fd","name":"types","type":1,"children":[{"id":"e90d6f83-8af4-1b68-2b9d-074afbfdffeb","name":"mime.types","type":2},{"id":"0ab38f1f-9271-fecf-050a-c050799812b2","name":"node.types","type":2}]}]},{"id":"8380d8ba-fba2-105d-c77c-3e8e774b78a3","name":"qs","type":1,"children":[{"id":"72cff4f1-4209-1da2-4ca7-2abae20640f6","name":".gitmodules","type":2},{"id":"7d059a2f-be72-e36e-b8b9-ef0061e6af43","name":".npmignore","type":2},{"id":"c28cc662-2ec7-b6a6-9669-52cdcb63ee73","name":".travis.yml","type":2},{"id":"04d83c0b-3fc4-0742-49a9-b3ebed944db8","name":"benchmark.js","type":2},{"id":"94fb8218-b4a9-3305-49a9-a81c8e3e13ec","name":"component.json","type":2},{"id":"99537f53-3461-5480-d632-e19bb342ed3e","name":"examples.js","type":2},{"id":"f9b9766c-5ba5-8768-430b-363dfc0e3586","name":"History.md","type":2},{"id":"ac61c6ac-6b3e-1972-e332-41388b206506","name":"index.js","type":2},{"id":"259ee7a8-739d-dd2e-d329-d38a1208a76c","name":"Makefile","type":2},{"id":"ef1f7ebf-e48a-59a8-72dc-50836f4b0a94","name":"package.json","type":2},{"id":"c20d7ce7-72a6-3a0b-4327-12f8349162f1","name":"Readme.md","type":2},{"id":"a60f7abd-6fdb-2b12-f21b-8b6a919a0b51","name":"test","type":1,"children":[{"id":"48b0e84f-0dad-7080-aec7-d43f5bc7ab36","name":"browser","type":1,"children":[{"id":"8b14182d-a725-9001-3e9c-72d10247d7ca","name":"expect.js","type":2},{"id":"45e1a7e3-de20-b4a5-9a3a-14a94f4ba45b","name":"index.html","type":2},{"id":"ae845800-cbc2-7311-ba81-29fb71ba5581","name":"jquery.js","type":2},{"id":"12c636e2-377c-7949-0325-785227cb058d","name":"mocha.css","type":2},{"id":"64389052-e553-f87a-7082-9708296d4146","name":"mocha.js","type":2},{"id":"cd642ea7-4f90-bee1-2cc0-10c26fb23f96","name":"qs.css","type":2},{"id":"54123f7d-1e5c-bd56-0e34-f0a68eb68bc8","name":"qs.js","type":2}]},{"id":"f90e8398-f3e6-8700-26ba-4a9ba1771175","name":"parse.js","type":2},{"id":"0e008e95-1912-28ab-3c31-88eed45e07d2","name":"stringify.js","type":2}]}]}]},{"id":"ab7d278c-711e-ff93-48ca-4893f54ed6f2","name":"package.json","type":2},{"id":"ccb6750f-82ef-980a-e29e-44214440aaf6","name":"test.js","type":2}]},{"id":"e1ccf15c-414a-7035-68b0-cb37687f5eb8","name":"express","type":1,"children":[{"id":"4bf4540c-19bf-430c-4d31-73bb2151965c","name":".npmignore","type":2},{"id":"bec44e33-c1b1-897e-43d5-ad0d0d64ed4e","name":"bin","type":1,"children":[{"id":"0c025142-4c9c-0442-3c15-e5b49381473b","name":"express","type":2}]},{"id":"555462da-33a5-abcb-883f-a517be93f649","name":"History.md","type":2},{"id":"770b7a64-c78c-ae7b-df67-3c9e320655f4","name":"index.js","type":2},{"id":"b22d842f-b2fb-6084-912b-d6c53cc4d9da","name":"lib","type":1,"children":[{"id":"528e8909-a935-e78a-be06-dc12c3f77aaa","name":"express.js","type":2},{"id":"084e01c8-9858-1316-f110-59f23c167a83","name":"http.js","type":2},{"id":"9790dc0a-a814-ed42-5b80-33d6534ddd52","name":"https.js","type":2},{"id":"863b9dda-f135-f557-e7c7-c384ea4275ae","name":"request.js","type":2},{"id":"6f308db6-5fe4-670f-dae5-1e0f707d3671","name":"response.js","type":2},{"id":"64bf0c91-042f-a253-317e-c27c3f175b42","name":"router","type":1,"children":[{"id":"36b06c99-4088-e61f-0ae6-9c902501d76f","name":"collection.js","type":2},{"id":"3778c43e-dcf8-db2c-640f-a4bb66d762b4","name":"index.js","type":2},{"id":"2ee41040-42e1-17b9-ac4f-d191b5c5316b","name":"methods.js","type":2},{"id":"7bb6bcab-6899-ac5c-f31e-2dfcbe25f3dc","name":"route.js","type":2}]},{"id":"8628ecdd-e165-f27e-8e4d-33a9b1bd8dba","name":"utils.js","type":2},{"id":"7e1ef10a-486b-fd11-71ba-01986564c3a5","name":"view","type":1,"children":[{"id":"1d1b1a2e-91dd-6499-c333-e89fef64d43d","name":"partial.js","type":2},{"id":"38426f1e-0687-44d7-9bfc-97dd9940fead","name":"view.js","type":2}]},{"id":"d3703789-fd7c-ada3-9715-574c11ed3316","name":"view.js","type":2}]},{"id":"925be681-e615-4bb2-7dd9-12bb8a32fbe1","name":"LICENSE","type":2},{"id":"c0de1a81-9c99-8813-02f4-4fcc14373bcc","name":"Makefile","type":2},{"id":"1e40947a-7cf9-e7b0-2665-9a5797ebd953","name":"node_modules","type":1,"children":[{"id":"155d9113-b152-ae8a-e432-6c63509b1e94","name":"mime","type":1,"children":[{"id":"3ba5f9fc-3aae-826d-0120-3bf89950f00d","name":"LICENSE","type":2},{"id":"a1735798-fe3b-e617-bd62-fdd80ebca6cd","name":"mime.js","type":2},{"id":"98f672a9-1e2e-5793-62e5-3396fa070de1","name":"package.json","type":2},{"id":"b9708fed-f783-d354-0db7-fee6c6ab410b","name":"README.md","type":2},{"id":"2ca8bfa9-8d92-a23b-dc3c-bfaeffbc149d","name":"test.js","type":2},{"id":"1309a952-cac7-1c63-3987-6ef1da394ec7","name":"types","type":1,"children":[{"id":"42f6e06d-d2ae-2970-8145-62539bbf9df6","name":"mime.types","type":2},{"id":"666aa34c-3722-f0a8-f357-6cffd3f2f4f5","name":"node.types","type":2}]}]},{"id":"7aa22250-6a88-5059-284b-aae881757d8b","name":"mkdirp","type":1,"children":[{"id":"7403fab3-6293-4e79-3e5c-649a70339638","name":".gitignore.orig","type":2},{"id":"eed084dc-59a8-2e52-4061-06d41b112437","name":".gitignore.rej","type":2},{"id":"72a298b9-85b1-5dfc-c52b-f0d6183d98fb","name":".npmignore","type":2},{"id":"44ba43c2-9b3c-20a7-056e-e7569f68db39","name":"examples","type":1,"children":[{"id":"cf240dcb-c6d9-958a-e271-462494f57a7b","name":"pow.js","type":2},{"id":"bcb4f0d7-da2a-79da-a49a-c82e0f804ff1","name":"pow.js.orig","type":2},{"id":"450b6bdb-26d9-1724-a7cc-b4ef8c874515","name":"pow.js.rej","type":2}]},{"id":"c374ff77-7f4d-c845-0f6d-2da19c132a77","name":"index.js","type":2},{"id":"5ba0f550-fff3-7969-62dd-13d57cbc5074","name":"LICENSE","type":2},{"id":"670ddcc2-88dd-6764-b18c-bd0f4dd5c123","name":"package.json","type":2},{"id":"50fafa96-fb6f-4c8c-81ee-aed8e41708ef","name":"README.markdown","type":2},{"id":"4a8e409e-28d5-4482-f883-42fa867ca44b","name":"test","type":1,"children":[{"id":"a7422c74-fd0e-b77b-c890-f6a7f6d4ef1f","name":"mkdirp.js","type":2},{"id":"4d826344-bfa0-d303-d380-8f96d4d36d4b","name":"race.js","type":2},{"id":"ea610263-0f1c-250e-974b-98e898e0f33a","name":"rel.js","type":2}]}]},{"id":"c1a17d26-a402-fc6d-4e07-645854f105fe","name":"qs","type":1,"children":[{"id":"2e539420-fe49-ba97-614a-21892e6f6a69","name":".gitmodules","type":2},{"id":"f65babc6-47ce-b834-d1e6-6c4bc446df56","name":".npmignore","type":2},{"id":"baca6d4d-18a8-913b-f168-4dd405454fdf","name":".travis.yml","type":2},{"id":"4f3644fb-d1e7-81b3-9c60-d2181ff07974","name":"benchmark.js","type":2},{"id":"7cf32209-8d6f-0194-9d26-a7af413a8c5e","name":"component.json","type":2},{"id":"e5a809f7-87a0-ed31-f469-31411ea3cca9","name":"examples.js","type":2},{"id":"cb9cb3d1-1f85-4240-bb10-42ef0af708cf","name":"History.md","type":2},{"id":"69476f61-9ee4-3950-96b3-3cf824020e39","name":"index.js","type":2},{"id":"071afcaa-eede-d648-d5be-18e4c24d0b96","name":"Makefile","type":2},{"id":"b719d2b6-ede1-98f0-c85b-035f256c5e91","name":"package.json","type":2},{"id":"e838aa10-a6fe-a360-4df7-ed78865ce7b3","name":"Readme.md","type":2},{"id":"34b08a60-9d10-99a5-82a2-4218e514d4e0","name":"test","type":1,"children":[{"id":"8477cfed-d6e5-a576-517d-67a638795f4f","name":"browser","type":1,"children":[{"id":"351569ef-ac99-7285-2bda-da4fa5c7be47","name":"expect.js","type":2},{"id":"d789134b-ff49-62bc-e1fa-8cf63e8913ec","name":"index.html","type":2},{"id":"0006c9dc-d863-4a31-44d6-c6df8cde08f9","name":"jquery.js","type":2},{"id":"a2cfc5cd-ac4f-c668-69c8-2ae158b0960b","name":"mocha.css","type":2},{"id":"26ac3da4-e81c-0df9-e89e-043dbb50d45c","name":"mocha.js","type":2},{"id":"e0565bfb-69fe-9ec2-cec6-fcd7a0bcbfe5","name":"qs.css","type":2},{"id":"33244ac5-5ad7-763e-c6fc-d4542ba4b198","name":"qs.js","type":2}]},{"id":"16c7f212-0f06-da7d-e26c-65b51b1c0248","name":"parse.js","type":2},{"id":"839e1faa-a985-e2ed-37ea-b4599a7e7b96","name":"stringify.js","type":2}]}]}]},{"id":"82c9f5cd-7a28-3027-31d6-5b5eba3bc289","name":"package.json","type":2},{"id":"052624e1-973c-940a-2ebd-859a8929a392","name":"Readme.md","type":2},{"id":"5a4632e9-858c-912c-b737-55519a171423","name":"testing","type":1,"children":[{"id":"7591a095-e444-a908-09d8-e3d17a179167","name":"foo","type":1,"children":[{"id":"513fd131-b44e-8a30-7051-043db7473904","name":"app.js","type":2},{"id":"c5ef09b3-41a4-7d3f-66f2-02a0b7097dd6","name":"package.json","type":2},{"id":"48b02045-65be-9cec-1ab9-41a216ee0031","name":"public","type":1,"children":[{"id":"44e6f2c3-b1a7-c45c-38b4-5796b1aafdfd","name":"stylesheets","type":1,"children":[{"id":"92055a08-7974-f838-20f5-a960c7cefee8","name":"style.css","type":2}]}]},{"id":"b32c61d6-cf4c-0142-19d5-2a9e4ca1c972","name":"routes","type":1,"children":[{"id":"951fe9ee-eb11-024a-4c5c-0fd0580b8cfa","name":"index.js","type":2}]},{"id":"000c7fdb-cb50-ea83-977b-d8ef21835c25","name":"views","type":1,"children":[{"id":"8b4c0a6c-b48b-fbaa-76d7-5569393b1256","name":"index.jade","type":2},{"id":"066a4a84-99d0-b674-c34d-bc363ca045bb","name":"layout.jade","type":2}]}]},{"id":"674f0512-6608-13af-1ac1-c17a61069eef","name":"index.js","type":2},{"id":"467cf9a1-376d-80ea-6626-3a5d87cf03a4","name":"public","type":1,"children":[{"id":"97f3a2f4-cd73-3132-9db8-b7d40d748a0e","name":"test.txt","type":2}]},{"id":"a338661f-2c98-4216-a964-35f2f9a3c193","name":"views","type":1,"children":[{"id":"9176229e-e2e5-6c32-ca5d-b2b71eedf231","name":"page.html","type":2},{"id":"156e9cd5-ac75-6537-5567-e1478e9553fc","name":"page.jade","type":2},{"id":"c81d3b96-7da6-52d1-5eeb-a1ec92c3525d","name":"test.md","type":2},{"id":"8fef33ff-e24f-b010-c7a8-c7c408055d36","name":"user","type":1,"children":[{"id":"433d9e82-2142-0889-eaf6-2a5e07e83f0b","name":"index.jade","type":2},{"id":"f88d2eef-ebcd-bc78-3db0-8e1b7b5d05cc","name":"list.jade","type":2}]}]}]}]},{"id":"59f33006-7872-5c25-5c27-83a291f2927c","name":"jade","type":1,"children":[{"id":"3473ff46-8a2e-b53e-6156-d7fdf1f0178e","name":".gitmodules","type":2},{"id":"6e953bbd-af89-a782-3d62-c8b3de420325","name":".npmignore","type":2},{"id":"35156213-3d00-f0fa-3174-2078a3436bb0","name":".travis.yml","type":2},{"id":"fc75c6e9-2a76-0e5a-f506-d71f23281763","name":"bin","type":1,"children":[{"id":"bab9ada5-5a9a-7ddc-ed07-4d9d314ab9ec","name":"jade","type":2}]},{"id":"3ea46050-268e-bf71-dccf-416f268f21e4","name":"History.md","type":2},{"id":"41d8aa7b-4e24-e692-fb95-2ced42a95ece","name":"index.js","type":2},{"id":"99430c4c-edb6-40a3-dee9-c6b56cfb3ee9","name":"jade.js","type":2},{"id":"289a180f-6a06-8b23-b19a-60c5d41a6015","name":"jade.min.js","type":2},{"id":"71d1d477-ac4b-1e37-66f9-3b2e63297aa8","name":"lib","type":1,"children":[{"id":"a5ee067a-7eab-e637-df29-f0d125a9c695","name":"compiler.js","type":2},{"id":"70e48eb4-9204-64dc-9551-3bc06cc94ae8","name":"doctypes.js","type":2},{"id":"62b70367-9d54-2266-3726-7f2c809ca8bd","name":"filters.js","type":2},{"id":"eca34226-b465-cc07-115c-4513360c0bad","name":"inline-tags.js","type":2},{"id":"f9b7de4f-e646-5260-35fb-bd0461972f52","name":"jade.js","type":2},{"id":"02ff365e-88c5-525b-33ef-37654a75433f","name":"lexer.js","type":2},{"id":"4bb867ca-46ab-10bc-1207-a6a12b5897bd","name":"nodes","type":1,"children":[{"id":"2e512e01-573c-cc1f-969f-8aef73e1187d","name":"block-comment.js","type":2},{"id":"18d846d4-1009-4cf1-3407-bd1b7d369be8","name":"block.js","type":2},{"id":"25d5942e-06ec-42e9-bb37-7c20180863cd","name":"case.js","type":2},{"id":"e3a06cb1-1002-e6ed-911b-0317266d18b9","name":"code.js","type":2},{"id":"055fb673-d5a1-596c-d17f-0b126a3b4e9c","name":"comment.js","type":2},{"id":"02c2194b-e649-bc0d-9078-e3c4a67a625b","name":"doctype.js","type":2},{"id":"16b07870-9c74-aa7a-31e0-711da30ca941","name":"each.js","type":2},{"id":"b8954034-246c-d902-29ee-c875d6b9292a","name":"filter.js","type":2},{"id":"4541815c-450a-0e93-75f9-f7a940cb6210","name":"index.js","type":2},{"id":"db5e9dcd-3f28-b540-5e43-9e521fd40da6","name":"literal.js","type":2},{"id":"f764bcb2-5b0c-6ef1-3ccb-09c92be586e5","name":"mixin.js","type":2},{"id":"1a2d5c4e-2d53-86e5-08b8-1044c0d24aba","name":"node.js","type":2},{"id":"94ddee5b-683a-72c1-1ae6-f777249d0ee5","name":"tag.js","type":2},{"id":"3829f83e-2614-1b1b-9752-1eb859002858","name":"text.js","type":2}]},{"id":"70f0decf-ed8b-d743-18dc-99898f2995e6","name":"parser.js","type":2},{"id":"f6af476a-3294-6205-7ede-a9527dc8162c","name":"runtime.js","type":2},{"id":"e79bcf63-7e6b-45ff-39e5-f78755c51c00","name":"self-closing.js","type":2},{"id":"ddc84bac-2879-f9f3-2fd4-b41e489260cb","name":"utils.js","type":2}]},{"id":"d453c199-6f0b-758c-d1f0-6ae1c349b37c","name":"LICENSE","type":2},{"id":"464c4f9e-9aef-7014-06cd-1105255b6f67","name":"Makefile","type":2},{"id":"265fde5e-8c7a-2da0-ad1a-59925e962620","name":"node_modules","type":1,"children":[{"id":"1348c227-a727-958b-fd4b-fa972b7a7168","name":"commander","type":1,"children":[{"id":"670069b5-f99f-23bf-f3d6-aed475188bc6","name":".npmignore","type":2},{"id":"394e73db-611d-5e14-3684-7018853b0c8e","name":"History.md","type":2},{"id":"1999a88f-d8cb-1c9f-1bdb-a087d21944ca","name":"index.js","type":2},{"id":"3afdf770-21e5-823f-4a79-99533550943c","name":"lib","type":1,"children":[{"id":"5d9a87ef-b239-cd23-ab6e-0086da217ee6","name":"commander.js","type":2}]},{"id":"05d412df-725d-e582-8e03-e736fd0e2117","name":"Makefile","type":2},{"id":"6cfeb156-1b36-8cc3-0a7e-01257f6b37f5","name":"package.json","type":2},{"id":"8611ef5c-e8cc-bd49-d099-f3ee13379d80","name":"Readme.md","type":2}]},{"id":"006807a3-8b21-8a80-1289-c078a48042c8","name":"mkdirp","type":1,"children":[{"id":"a1cfce24-6113-308b-b382-9fcb43984614","name":".npmignore","type":2},{"id":"ec6fee4f-4bca-4312-3cf5-a19ec38e7ccf","name":".travis.yml","type":2},{"id":"d3d4d185-c175-e187-376a-9862ebd4030f","name":"examples","type":1,"children":[{"id":"28617051-9b69-b2f5-7358-7f7c271524e6","name":"pow.js","type":2}]},{"id":"d00e2b78-dcf6-2d7f-8461-e9fd1516c9d2","name":"index.js","type":2},{"id":"ea9c00c9-9a23-d832-6fa4-960f8020755e","name":"LICENSE","type":2},{"id":"f1700430-535e-57f1-a758-da1e5a5d1d13","name":"package.json","type":2},{"id":"f753f1b8-3bb3-1c26-56e6-bab7544628e7","name":"readme.markdown","type":2},{"id":"d1e5d942-e4ff-b2d5-6633-651d377b50a5","name":"test","type":1,"children":[{"id":"fd4f87fa-01c0-ebfa-b8d7-dd83cf3260ce","name":"chmod.js","type":2},{"id":"ac4fbc16-383f-9241-2b2d-b87630ed0d2a","name":"clobber.js","type":2},{"id":"692f18bb-830e-4cea-2aea-e4e4b399f469","name":"mkdirp.js","type":2},{"id":"1b066724-0209-612b-4957-ba648546fce5","name":"perm.js","type":2},{"id":"3e0388ce-65a9-df20-a9f5-9a23f586a2ee","name":"perm_sync.js","type":2},{"id":"ac8030b6-5ac6-7c00-c376-2c4b07a14ff9","name":"race.js","type":2},{"id":"1e7c3126-fc5e-826a-d23e-b11b5907211f","name":"rel.js","type":2},{"id":"e55a9796-f3a6-6cf1-a556-1df88cc8fee9","name":"return.js","type":2},{"id":"8ab2359e-7367-f64c-cd29-70d97f5c286a","name":"return_sync.js","type":2},{"id":"6e9c9f29-abc7-6507-7619-8aa46f8904e2","name":"root.js","type":2},{"id":"17fc3791-3ff8-08cb-36da-356141e4ccbe","name":"sync.js","type":2},{"id":"62d713ba-f583-a750-eeb2-089117e76f77","name":"umask.js","type":2},{"id":"27744435-443c-3fe9-a1f0-00d931766619","name":"umask_sync.js","type":2}]}]}]},{"id":"a1cd6ced-5f29-e0d8-d3c7-5f589b6a78b1","name":"package.json","type":2},{"id":"8e0a03e7-8f73-31e8-2186-c803eda8f8bb","name":"Readme.md","type":2},{"id":"6898f8d0-fac1-80bf-2e11-e445edfe9024","name":"runtime.js","type":2},{"id":"7405d604-4c7c-2520-bf13-00051d45522d","name":"runtime.min.js","type":2},{"id":"c59d21cb-5206-e71a-7d20-736f80f8b767","name":"testing","type":1,"children":[{"id":"eeb3e95c-f580-bf33-2c6b-4bcbfb2a260d","name":"head.jade","type":2},{"id":"87ad1807-a2ba-5a1e-6aec-fa692911d9d2","name":"index.jade","type":2},{"id":"951c8370-b0e2-a5d6-52a5-de12327d8d61","name":"index.js","type":2},{"id":"30b4b17f-0de2-284c-154b-5ae8b9b6e28e","name":"layout.jade","type":2},{"id":"e94c585c-dc38-1c56-92ca-af881f2a9405","name":"user.jade","type":2}]}]},{"id":"3d4efa29-d905-11d0-6b20-bf2f536397c1","name":"mocha","type":1,"children":[{"id":"0fa1f908-37cb-ce61-b6dd-e3374eeb72cb","name":".npmignore","type":2},{"id":"7e3dff87-d037-302c-675a-934f44e9159b","name":".travis.yml","type":2},{"id":"d4e2fd0d-e670-7bee-7a85-ea938bf3c26a","name":"bin","type":1,"children":[{"id":"fa485b82-54f9-e555-64d7-ee6fcabc8fbe","name":"mocha","type":2},{"id":"e7b2139e-997d-3524-25c0-553261b657b9","name":"_mocha","type":2}]},{"id":"a30fd7b4-2cb2-7ded-681f-efddc67c696a","name":"component.json","type":2},{"id":"18fb5b5e-faab-8bbb-710f-b11d6d49990b","name":"History.md","type":2},{"id":"84f75de7-5511-7366-db5e-5b43bb7dd1e6","name":"images","type":1,"children":[{"id":"5b5a8da0-9142-70be-e76d-035c8d7aaacb","name":"error.png","type":2},{"id":"d53c2cea-4ffe-a5ca-cd3e-d5f55a5f15be","name":"ok.png","type":2}]},{"id":"c0d3cf5a-f134-2d03-f707-b382b37318b6","name":"index.js","type":2},{"id":"f7268822-9245-5ef9-41af-ff6b02910c16","name":"lib","type":1,"children":[{"id":"c0e7eeff-b1bf-f780-d113-ccaf7417fd92","name":"browser","type":1,"children":[{"id":"f8dfc439-b429-23b6-ecd0-d878d5aef101","name":"debug.js","type":2},{"id":"f672e1cd-ad31-313b-ed45-ecd0f3276922","name":"diff.js","type":2},{"id":"004d3c47-b1da-2307-20e0-a4d3cfab1faf","name":"events.js","type":2},{"id":"357563f0-7262-c069-4929-d7a8ccec18a4","name":"fs.js","type":2},{"id":"7c87c66d-2c6d-717f-65ea-7b539bdfc69a","name":"path.js","type":2},{"id":"67fdfa7c-0961-2bd9-e6dd-705bbe03c107","name":"progress.js","type":2},{"id":"a1a9ca2e-ca82-8f2f-ccbe-1f28fb90c5f7","name":"tty.js","type":2}]},{"id":"45700f44-d026-6548-7c30-99d229336f4d","name":"context.js","type":2},{"id":"40d25363-50d3-0e0c-5204-e19958de66e2","name":"hook.js","type":2},{"id":"2933c07f-3f13-e3f8-a46d-71bb421ba4a6","name":"interfaces","type":1,"children":[{"id":"dba4c9d5-45ab-ad8d-5f04-ef65a7b10a99","name":"bdd.js","type":2},{"id":"ef4be53d-bb15-8de6-8fdf-2defded9a4a8","name":"exports.js","type":2},{"id":"e3aaef57-1aea-8546-890c-8d7d2949b1e5","name":"index.js","type":2},{"id":"b1fd17ef-eb98-eefc-e782-72c3a976dd42","name":"qunit.js","type":2},{"id":"8169aff1-2569-8307-4af3-20db926e74ff","name":"tdd.js","type":2}]},{"id":"9d391411-1238-e60f-5262-1de62348cfde","name":"mocha.js","type":2},{"id":"1034f388-a272-95e1-2c1d-ce45e5018c12","name":"ms.js","type":2},{"id":"0c607770-6273-6170-eee7-f1b2f826850a","name":"reporters","type":1,"children":[{"id":"0c004609-f59f-3664-66d7-67a2c7ad124e","name":"base.js","type":2},{"id":"8809cb39-b89c-ddf0-2198-4a58bc1b461c","name":"doc.js","type":2},{"id":"4911878d-6b33-1a5f-7b11-7f3351a824c0","name":"dot.js","type":2},{"id":"7f3df18a-7c54-3bd1-58ca-21ff5a27c345","name":"html-cov.js","type":2},{"id":"5bc7e22f-4045-708b-74d5-ba2f3b8e14df","name":"html.js","type":2},{"id":"9c92219e-aedd-2e20-790a-f2c090d504f3","name":"index.js","type":2},{"id":"a9292e72-5487-80d1-e0d9-5a14d624d829","name":"json-cov.js","type":2},{"id":"ec1e164a-f8ae-b67b-fb46-83a4ff8554d2","name":"json-stream.js","type":2},{"id":"3975e4ea-9975-4651-9b69-9565ccb0b681","name":"json.js","type":2},{"id":"e2a9ec8a-41cf-4eba-66b0-591bb1cd31ee","name":"landing.js","type":2},{"id":"013e4d58-5301-24e1-1e2f-acf7bcdf8af7","name":"list.js","type":2},{"id":"722eec2e-3436-d4f5-8755-54648ff575c2","name":"markdown.js","type":2},{"id":"0d45dfec-a825-16db-e26d-768ca0aa4e3d","name":"min.js","type":2},{"id":"7ce9a56a-5cc5-7066-c0b0-202ee1c7f48a","name":"nyan.js","type":2},{"id":"85446c81-4c20-3d29-1203-f4e7a4a4de22","name":"progress.js","type":2},{"id":"bf68f8a9-c81f-0a19-8f34-fbfc90e1b94a","name":"spec.js","type":2},{"id":"3fc20ca7-51bf-4ad6-20d2-da743b1b9064","name":"tap.js","type":2},{"id":"61c73daf-86aa-0b2c-e2c6-d2c5e15b0967","name":"teamcity.js","type":2},{"id":"f4cc6264-43da-070b-06cd-05957889ba04","name":"templates","type":1,"children":[{"id":"1571c2b5-c2a7-c449-f76a-8a0dfc7adb0d","name":"coverage.jade","type":2},{"id":"80ba1fbc-89d6-c3b9-af2c-cd53424d799b","name":"menu.jade","type":2},{"id":"664cdc64-8893-b364-491f-519cf2a8990b","name":"script.html","type":2},{"id":"c228cc74-67a6-849c-2003-9e348d67bf4e","name":"style.html","type":2}]},{"id":"ba53246e-06b9-44a6-0450-44da4dce28e1","name":"xunit.js","type":2}]},{"id":"7d0a871e-038a-b120-0134-952d6f8e610a","name":"runnable.js","type":2},{"id":"345b0adc-47fa-4ceb-3e21-c6f4e2e082b0","name":"runner.js","type":2},{"id":"f66eece7-4d91-55a0-bf48-3404d153bbfb","name":"suite.js","type":2},{"id":"a97e2cb7-0b75-fa7f-b3e1-5b4674c41a80","name":"template.html","type":2},{"id":"d4ed3348-dd5e-6ac8-5cbf-a1ee20e68024","name":"test.js","type":2},{"id":"00fa37de-b1b8-b8c4-4b87-a97431b8ea46","name":"utils.js","type":2}]},{"id":"7c635076-78ce-a0f9-7981-c3f1e8711c29","name":"LICENSE","type":2},{"id":"bc9984d9-9936-e836-07f7-baab62a4fa10","name":"Makefile","type":2},{"id":"91c0101f-e390-df4e-e7e1-9229cebcf3d6","name":"mocha.css","type":2},{"id":"9723c36b-348a-356b-d583-90b5580e1bfe","name":"mocha.js","type":2},{"id":"3dd0dc3d-67f7-e2ff-06c5-e42e67796a3f","name":"node_modules","type":1,"children":[{"id":"7409facf-d1ca-8c8f-5e4e-a426d9c8ff7c","name":".bin","type":1,"children":[{"id":"1ff26e17-758e-a7cf-8d5e-0a07c1646f90","name":"jade","type":2},{"id":"0dfad8db-9d1e-4f74-d98a-d3ebfbe18e0f","name":"jade.cmd","type":2}]},{"id":"a567440b-b79f-9e9f-1051-d8178642e943","name":"commander","type":1,"children":[{"id":"0399d77a-bc3b-2410-adf2-5b398bcea2a6","name":".npmignore","type":2},{"id":"c322d169-5f6e-9338-0e84-3338061e34bf","name":".travis.yml","type":2},{"id":"32cbd658-e1d8-eaf0-8528-65af8a5fd497","name":"History.md","type":2},{"id":"9f434f73-f229-e7f0-e9c9-8d75e58a3baa","name":"index.js","type":2},{"id":"72aac873-df54-8c96-fc80-7004bdc8ee2e","name":"lib","type":1,"children":[{"id":"58d7530c-6ec7-253f-a2ed-2b0fd0fb65ac","name":"commander.js","type":2}]},{"id":"3a9da74e-2bd7-724a-58e1-f4213c014da0","name":"Makefile","type":2},{"id":"1d715eec-5751-8adb-51ba-2cd19deaeeef","name":"package.json","type":2},{"id":"2bc05217-71c9-dceb-7d79-f3c31096745b","name":"Readme.md","type":2}]},{"id":"e295823a-0978-3e7e-492a-8fbc1ccccf3e","name":"debug","type":1,"children":[{"id":"95741bab-dcf0-ee0d-f24d-88df6d64864c","name":".npmignore","type":2},{"id":"2a3a2993-a354-f623-a185-abab7360473f","name":"component.json","type":2},{"id":"a598689d-d54b-01c4-a223-39b16dd4f209","name":"debug.js","type":2},{"id":"4baac93d-aa15-f168-a250-0890502898f3","name":"example","type":1,"children":[{"id":"07720c18-455b-4e09-e9ed-12f4d44cb83f","name":"app.js","type":2},{"id":"1c1886a5-c09a-3fc4-c124-46e549f33dd8","name":"browser.html","type":2},{"id":"ee8dabfc-1e8e-a8db-5884-0342de68abde","name":"wildcards.js","type":2},{"id":"040fad12-011e-06a7-124b-cf1edbf2e2c7","name":"worker.js","type":2}]},{"id":"0cfa97fb-4baa-c1f9-0d4e-ad1d50911f74","name":"History.md","type":2},{"id":"c25b89a9-8edd-ef6d-5b22-d4f380568386","name":"index.js","type":2},{"id":"df448038-172e-66cd-7174-9a8df0d6becc","name":"lib","type":1,"children":[{"id":"7ec5952d-4b2d-51e6-ad49-25462b180cab","name":"debug.js","type":2}]},{"id":"935db9b6-873a-7802-f2a4-3eda7e971afa","name":"package.json","type":2},{"id":"b2057044-da80-c1d2-e41f-96d0e1f99b7d","name":"Readme.md","type":2}]},{"id":"b3c600ef-46ef-3760-4415-5c8fed914d61","name":"diff","type":1,"children":[{"id":"2f53c1a6-3a30-cde6-483c-b4c51531fad6","name":"diff.js","type":2},{"id":"3fedceac-1f79-a9ce-ba75-f28c7c978b16","name":"index.html","type":2},{"id":"16dafe02-a811-79d2-d887-f6242d42180b","name":"LICENSE","type":2},{"id":"835747fb-5ca8-87bc-67c8-458f99bf50dd","name":"package.json","type":2},{"id":"dfc851f4-f391-01a7-ffa8-6fbf81873c56","name":"README.md","type":2},{"id":"049197b4-3607-7042-a614-8a206786a9b0","name":"style.css","type":2},{"id":"3ba6d962-dcc6-f021-b917-047668cbdb30","name":"test","type":1,"children":[{"id":"19cf976c-f323-e641-93e3-76d6f1197512","name":"diffTest.js","type":2}]}]},{"id":"395ce398-4987-52c9-bc21-9b872ba3dd74","name":"growl","type":1,"children":[{"id":"4f45180d-62f8-6e12-7c93-48a420979c04","name":"History.md","type":2},{"id":"f823cc8d-15f3-18f9-323f-309cab47cb3c","name":"lib","type":1,"children":[{"id":"bc45b4e5-c243-7f24-900e-7a27ba911eef","name":"growl.js","type":2}]},{"id":"dc5ace95-0b3c-4934-4b3c-a0eebb08b73c","name":"package.json","type":2},{"id":"2548ce77-e5e2-e8fc-b1c2-6c902dff9273","name":"Readme.md","type":2},{"id":"4eccfee9-0e59-b35d-3991-036aaf603b1c","name":"test.js","type":2}]},{"id":"b9e823db-09ea-c9b1-ddd9-5d3c8a880b3c","name":"jade","type":1,"children":[{"id":"e8abd8ee-264c-7a0f-0fac-a284a28a77c2","name":".npmignore","type":2},{"id":"e64c5ef8-356c-3a8e-a0b6-19283e382868","name":"bin","type":1,"children":[{"id":"151052a5-6e54-85cf-1a99-1985b9822cf0","name":"jade","type":2}]},{"id":"d0d7803d-ad96-aa61-1a7d-4345ea9fd519","name":"index.js","type":2},{"id":"351190f2-511e-6805-c735-ea7d6d288d90","name":"jade.js","type":2},{"id":"7f8ffdac-0035-5b5d-3b27-489580445791","name":"jade.md","type":2},{"id":"60ba97fc-6303-a2ea-bf5e-48374bd061a3","name":"jade.min.js","type":2},{"id":"f710d987-2c81-9928-5359-8dd4a3aad722","name":"lib","type":1,"children":[{"id":"1822ab2e-efa1-65d2-7c29-233e0e839717","name":"compiler.js","type":2},{"id":"96048020-f246-7cbc-ffb7-d298811323a0","name":"doctypes.js","type":2},{"id":"bc3e5cfd-6185-b054-f2ba-dbf3f862e07a","name":"filters.js","type":2},{"id":"45cb409a-7510-d8c8-d8bb-1f1723f24874","name":"inline-tags.js","type":2},{"id":"ed1161bd-7be4-8bba-0654-c6f28bed41bf","name":"jade.js","type":2},{"id":"f34019e7-f5fe-cac8-d88c-dcac862e6efd","name":"lexer.js","type":2},{"id":"24748c23-6a45-18b0-ef18-86fcf6075fee","name":"nodes","type":1,"children":[{"id":"e2dc541d-24f5-7c87-34ee-6e9dd82d9f37","name":"attrs.js","type":2},{"id":"21c259d6-9ebd-29ab-9ec2-b6ab6814b8fc","name":"block-comment.js","type":2},{"id":"b08778fa-6b80-d5da-a60e-47bc7c3fc048","name":"block.js","type":2},{"id":"186b177d-096b-b657-2bd6-9a2dbfd4bb3f","name":"case.js","type":2},{"id":"d9fb3e40-0445-c0aa-c702-cae10b4d1776","name":"code.js","type":2},{"id":"cabb65a3-68ea-e267-6fe6-f9bd6ad3f8ec","name":"comment.js","type":2},{"id":"4d14ba52-166e-7156-8001-beffbb5261a7","name":"doctype.js","type":2},{"id":"33a957be-c593-8f19-3df7-710b6c124196","name":"each.js","type":2},{"id":"d511cae6-14b9-2078-65b8-977ae9713b3d","name":"filter.js","type":2},{"id":"80afc9fc-2fc5-30ac-eb1d-2730949dc4cf","name":"index.js","type":2},{"id":"5308e0a0-fda4-98dc-2752-bcd912a86169","name":"literal.js","type":2},{"id":"e50155b1-478a-2759-d588-fd59ac5b7bfb","name":"mixin.js","type":2},{"id":"755497bc-9080-9197-ef37-f43788429596","name":"node.js","type":2},{"id":"949d7887-ac5c-864f-594e-16a3e7d9668f","name":"tag.js","type":2},{"id":"9dd92fc0-2a8c-3c11-9728-2a9fa51bf783","name":"text.js","type":2}]},{"id":"3273caad-cd3e-e040-90e0-5856be11423b","name":"parser.js","type":2},{"id":"db9b8b60-8c01-8f2d-d357-a311653b4c9b","name":"runtime.js","type":2},{"id":"1baa9314-03d6-0f20-d7e8-ee363bc1976b","name":"self-closing.js","type":2},{"id":"fc9b7d59-b73d-fc13-2f9e-114f1a260c2b","name":"utils.js","type":2}]},{"id":"96c54d36-ba70-73d7-6dc8-5079eb76cb3d","name":"LICENSE","type":2},{"id":"03b5c797-ec1e-6ae0-8edc-e6dafd38364c","name":"node_modules","type":1,"children":[{"id":"5ea71570-f09c-2656-cd8c-18c0c8394110","name":"mkdirp","type":1,"children":[{"id":"151047ae-36fa-1b05-9d61-fe7419da5305","name":".gitignore.orig","type":2},{"id":"105ab07e-20c6-c1f2-8a9f-25f89f2dc6e4","name":".gitignore.rej","type":2},{"id":"e742fa67-e6d8-0f88-f2ea-114e0938d583","name":".npmignore","type":2},{"id":"48ac032e-3491-5e8b-6a0a-09dd72dbf2e2","name":"examples","type":1,"children":[{"id":"03d01e2b-7460-6ef3-678d-603bebf2e5b3","name":"pow.js","type":2},{"id":"d665c57d-c59c-0c6c-3f6a-945217af87fc","name":"pow.js.orig","type":2},{"id":"1af5c0ff-6eb1-92cf-72c5-5625a983635e","name":"pow.js.rej","type":2}]},{"id":"f571dc65-fe08-af1a-fc76-6879551c4023","name":"index.js","type":2},{"id":"929d74d8-6448-491b-8f48-6b9ac2b3934a","name":"LICENSE","type":2},{"id":"e7a52d4d-252b-5c79-86e6-5d3f5a446cdb","name":"package.json","type":2},{"id":"6a148a17-c28c-e5e2-9e47-b7901e07e43d","name":"README.markdown","type":2},{"id":"ea319dad-a4b7-7d16-a8fa-5f03a6bec80b","name":"test","type":1,"children":[{"id":"5fadfdcd-8a37-3111-74fb-9a19cf6838c8","name":"chmod.js","type":2},{"id":"29f083c4-d4f7-0894-d504-97ff8f1ad1da","name":"clobber.js","type":2},{"id":"3dd20ef2-c719-bba8-5853-05b52dd83cc6","name":"mkdirp.js","type":2},{"id":"3984fb0d-8e0e-b705-8d5d-ea930e1f81b7","name":"perm.js","type":2},{"id":"a6fd981f-4ab4-ef18-acf4-d99a405bd7dc","name":"perm_sync.js","type":2},{"id":"204f9ed6-8357-0280-e4ac-99dd5780392e","name":"race.js","type":2},{"id":"4f4d84ac-6b97-785f-0eb4-7c13fa7762b7","name":"rel.js","type":2},{"id":"10aaf158-48d9-cc83-151b-6de275eb6077","name":"sync.js","type":2},{"id":"98d56114-4560-ee4f-0b60-f09f0b80e90e","name":"umask.js","type":2},{"id":"7385d340-437c-1ac1-1c58-e56f29d3568a","name":"umask_sync.js","type":2}]}]}]},{"id":"ca1d5786-75fd-a66b-5c74-16af293e9173","name":"package.json","type":2},{"id":"b6ef421d-9fee-e63c-17cb-37e44c56727a","name":"runtime.js","type":2},{"id":"2f341566-72d1-af66-5fac-d968813e10fa","name":"runtime.min.js","type":2},{"id":"8f8bf87d-04da-38ab-7c13-3bb16c980c64","name":"test.jade","type":2},{"id":"7a5621e8-0ba2-71ae-2a08-390fafb57a30","name":"testing","type":1,"children":[{"id":"dabc1fec-93e0-b0c8-8e41-7b3caea726d0","name":"head.jade","type":2},{"id":"3c49ebf3-e759-a3fc-f0dd-147ca5d98bf0","name":"index.jade","type":2},{"id":"b56e3540-d874-a27f-d50a-e06f66793dbe","name":"index.js","type":2},{"id":"6f46410c-b4e2-b7f0-d6dc-7596063b80ed","name":"layout.jade","type":2},{"id":"406a949a-e3de-b1f4-14b3-1fb16c66730c","name":"user.jade","type":2},{"id":"cff2ef8f-caa6-fc7a-fee9-f764713643d9","name":"user.js","type":2}]}]},{"id":"c9f8014a-653a-495a-8b7b-43ae984a73b1","name":"mkdirp","type":1,"children":[{"id":"48c7f238-02ea-6e11-d308-3381af9656f9","name":".gitignore.orig","type":2},{"id":"9b14f8ae-34b9-470f-8b29-9b84124f51da","name":".gitignore.rej","type":2},{"id":"aff25f84-888d-8b17-9d48-3d3bbc34707a","name":".npmignore","type":2},{"id":"6ee2023c-661d-a050-90f7-7aafb832f1ef","name":".travis.yml","type":2},{"id":"d92bbfef-b370-7b94-1eab-9f7db3c16174","name":"examples","type":1,"children":[{"id":"2318d9bd-82f4-9c18-3c15-da8065ba12bb","name":"pow.js","type":2},{"id":"cad98c2a-6ecc-7662-3595-6840390f55fe","name":"pow.js.orig","type":2},{"id":"a19f714f-a151-6026-afd7-ca6e5f553f96","name":"pow.js.rej","type":2}]},{"id":"4f8294ee-0c85-b915-b328-783b3cb71f94","name":"index.js","type":2},{"id":"6191454d-0d50-f569-5f7f-252b0b168193","name":"LICENSE","type":2},{"id":"8aa63708-863f-9ed7-e725-91ddc16edc20","name":"package.json","type":2},{"id":"88875ac9-dbde-04e7-3004-8a99bc126a8c","name":"README.markdown","type":2},{"id":"15a49750-2f09-57ec-bb69-e42911437707","name":"test","type":1,"children":[{"id":"6468cac6-7a6c-7953-865c-c74e9ddf7a17","name":"chmod.js","type":2},{"id":"24aae515-6d46-0d1c-4b52-d630df091210","name":"clobber.js","type":2},{"id":"50b71b61-15e5-cabb-05cd-10abbf6b2a71","name":"mkdirp.js","type":2},{"id":"cb0db313-2560-3705-a5b6-c177d55343b8","name":"perm.js","type":2},{"id":"64d3eb3b-9316-6164-4489-d83e1b61f44a","name":"perm_sync.js","type":2},{"id":"4bd53238-80ac-f154-0edc-b31e6d217272","name":"race.js","type":2},{"id":"b5f2c6a2-cdfb-6e0a-3bb3-4501315986d1","name":"rel.js","type":2},{"id":"a0210e05-df8d-60e5-85a7-5ac5f3174745","name":"return.js","type":2},{"id":"63a33ae2-551f-867b-f6e4-1c0a7519cdea","name":"return_sync.js","type":2},{"id":"04ef2b70-86d0-50ee-0304-ec067124f477","name":"root.js","type":2},{"id":"ddf461a5-c695-6fc6-88f2-6b5671f3e13d","name":"sync.js","type":2},{"id":"b4baab9a-6213-04d5-f764-07ccd3721036","name":"umask.js","type":2},{"id":"23e34b2a-14cb-6cbf-2ee1-cba9336df643","name":"umask_sync.js","type":2}]}]},{"id":"fd328e54-e2ea-a7bf-cabc-8ddee7f5c17d","name":"ms","type":1,"children":[{"id":"4caddace-7147-763a-44a8-ca2d0ff8c5f8","name":".npmignore","type":2},{"id":"6ed2d98a-35e0-b4b2-b207-6597c2196bbe","name":"component.json","type":2},{"id":"4bc1ae1c-69c3-faea-3278-c573dff5dad1","name":"History.md","type":2},{"id":"2919be7c-0a9b-963e-6ceb-df08306cfc59","name":"Makefile","type":2},{"id":"886100e7-94ba-70ba-ee90-d7b16b9d53cd","name":"ms.js","type":2},{"id":"4427c8b2-aa9c-caf2-43e9-8e975da41a9c","name":"package.json","type":2},{"id":"d29d9fea-6242-d501-4c1d-e38c731e3d60","name":"README.md","type":2},{"id":"3d2dddda-b2f8-3223-b0a2-1025f1ab0dc4","name":"test","type":1,"children":[{"id":"125c3554-afd1-954f-56d1-a2222db7c3a2","name":"index.html","type":2},{"id":"494ba0fc-543b-db06-81d9-b43c8748bd2c","name":"support","type":1,"children":[{"id":"51dd5c82-752c-0865-401b-b36f57f10fb0","name":"jquery.js","type":2}]},{"id":"f239dafb-fc21-d357-08d2-5397c0ed55fb","name":"test.js","type":2}]}]}]},{"id":"1b3b3793-5e62-43b9-0e22-e1f15e0b7ecf","name":"package.json","type":2},{"id":"e49540f8-1e56-82ba-182f-8120e8cd099d","name":"Readme.md","type":2},{"id":"e1a52bfd-e56a-c31e-5546-eba28e2b8153","name":"test.js","type":2},{"id":"65b67cf5-996f-595e-6e57-f2c11c9d64f7","name":"_mocha.js","type":2}]},{"id":"9c68c96a-28f4-d9db-3b2f-ca926c21f44e","name":"mongoose","type":1,"children":[{"id":"cd6b5439-a635-b5cf-7dde-9534a9a6490f","name":".npmignore","type":2},{"id":"383d54ab-697f-691f-4b29-814fa096764d","name":".travis.yml","type":2},{"id":"0f4a8a0a-980e-970b-4020-401d2e0a37d2","name":"CONTRIBUTING.md","type":2},{"id":"2a0aed37-6e90-47f4-2daf-5d9d9ab218a3","name":"examples","type":1,"children":[{"id":"4ad3a5d2-600f-0001-5054-a5b17579f460","name":"schema.js","type":2}]},{"id":"8748b70d-b4aa-17ee-1631-1817c39dbaad","name":"History.md","type":2},{"id":"a8cd3d59-b1ba-efd5-8e22-11ec77e8a3ee","name":"index.js","type":2},{"id":"20029518-fc93-7736-0e60-9305c5c56ce3","name":"lib","type":1,"children":[{"id":"345608a9-8330-d529-d5aa-4f7906d2c60a","name":"collection.js","type":2},{"id":"ffdb3e3b-f77e-8d2f-8888-44c29de413d1","name":"connection.js","type":2},{"id":"998a2e5b-1051-35b3-143a-0aa8b9267013","name":"connectionstate.js","type":2},{"id":"c1abd4d2-1032-9baf-e724-499b526baa39","name":"document.js","type":2},{"id":"9e339043-0285-82b5-e110-c24ade82fd4c","name":"drivers","type":1,"children":[{"id":"eb3ee14c-2f1b-7787-bdd4-72ae1c1890c2","name":"node-mongodb-native","type":1,"children":[{"id":"1d827ca6-48d4-58ef-1d6e-d980a2f450f6","name":"binary.js","type":2},{"id":"7b6e58f6-adf2-b786-d586-8b1e7c86e657","name":"collection.js","type":2},{"id":"9528a9f1-209e-bca8-d876-b666c9c8f494","name":"connection.js","type":2},{"id":"5a3444ab-6ea4-9ab1-c42b-a0c1cd9a9f1e","name":"objectid.js","type":2}]}]},{"id":"382ede94-ed76-261a-594f-e9f49885511d","name":"error.js","type":2},{"id":"584c9b1f-d4ad-a297-2bda-6acbb3d5b0cb","name":"errors","type":1,"children":[{"id":"ea3a3b9c-3370-32fd-6786-7f8b99da7d30","name":"cast.js","type":2},{"id":"1b555eaa-ba31-64bd-4327-b3cf352f8bd0","name":"document.js","type":2},{"id":"8633f2dd-2766-104d-1642-fd429c0e9464","name":"missingSchema.js","type":2},{"id":"12a7d934-fde6-7ab7-a687-501213e5ed90","name":"overwriteModel.js","type":2},{"id":"ce0e3659-7481-73a9-bc64-f9d9e3b1c538","name":"validation.js","type":2},{"id":"21198cc6-94ba-d36f-3dae-a65b47ec5b6d","name":"validator.js","type":2},{"id":"8faa1d11-53c0-1169-6413-5473aea4698c","name":"version.js","type":2}]},{"id":"d4952b0c-5011-8039-a1b4-463540575589","name":"index.js","type":2},{"id":"4bb3c09b-3b00-ba93-668c-49da89eac270","name":"model.js","type":2},{"id":"3aebaa97-85e3-d0d2-57d8-0d8f44138c9a","name":"namedscope.js","type":2},{"id":"47f7a122-27f7-8b25-d4b7-9d72ba20002e","name":"promise.js","type":2},{"id":"d1cdf921-6667-b10b-892f-917ce2dbf6dd","name":"query.js","type":2},{"id":"7ddb1898-ea3f-e11f-5537-1e8b01e51f99","name":"querystream.js","type":2},{"id":"44d267f0-5a0f-cc72-df8d-cb87eff9d47f","name":"schema","type":1,"children":[{"id":"8d987e2e-a2c7-cf26-456e-062763010f31","name":"array.js","type":2},{"id":"6881b90d-a3a0-2b40-4536-178aeb5ef86c","name":"boolean.js","type":2},{"id":"4f2d9856-04fb-c299-7e36-fe6f057fd0c7","name":"buffer.js","type":2},{"id":"ff2d5de4-ee90-43ab-0177-7e45a9b711f1","name":"date.js","type":2},{"id":"d2a42616-c93e-8793-a649-10553f21884d","name":"documentarray.js","type":2},{"id":"4a681946-ee94-a749-c397-72081c30c4c2","name":"index.js","type":2},{"id":"a35d681b-3c2f-76ee-3085-b41e36eb8dab","name":"mixed.js","type":2},{"id":"e5d1f5c8-7842-7879-9979-a4fd47ce56e8","name":"number.js","type":2},{"id":"c0b8486f-fb43-8ed3-337a-f04b041636e4","name":"objectid.js","type":2},{"id":"d4002666-4d7a-25cc-b486-9e68cb740e84","name":"string.js","type":2}]},{"id":"1f378a23-0634-ec3a-2746-4c2f7c3c8050","name":"schema.js","type":2},{"id":"be83406e-ab45-f985-c0a3-05e3e8cfe116","name":"schemadefault.js","type":2},{"id":"c6bd96c7-0ffe-2e60-963d-c470d67da2da","name":"schematype.js","type":2},{"id":"10452156-bbd7-9278-feed-a9ce3479ca10","name":"statemachine.js","type":2},{"id":"9c42fa27-f9af-7ab5-75ff-d3ecb6427780","name":"types","type":1,"children":[{"id":"07e1ae70-751a-0893-1383-2d474f984715","name":"array.js","type":2},{"id":"50c6dbee-8a04-843d-4189-e2a8d21af7d5","name":"buffer.js","type":2},{"id":"7b765147-17f3-5934-dbb4-8a3f864b5c25","name":"documentarray.js","type":2},{"id":"83b44934-fb95-c556-baac-61e6d6333e90","name":"embedded.js","type":2},{"id":"f84fe550-e619-68e1-95a8-90af2ee893cd","name":"index.js","type":2},{"id":"21612737-73b6-2311-fd02-eb113d264480","name":"objectid.js","type":2}]},{"id":"c8a65854-50b4-234d-669f-dd1c8f025de7","name":"utils.js","type":2},{"id":"a56cbf30-4ba0-6e2e-eb72-211480196118","name":"virtualtype.js","type":2}]},{"id":"fc987460-53be-8928-f50f-10b307a1b989","name":"node_modules","type":1,"children":[{"id":"f7e7e480-2e8d-c89a-0555-88c4568b0e71","name":"hooks","type":1,"children":[{"id":"b2681922-2bcd-7aaf-8a27-f5db8734596b","name":".npmignore","type":2},{"id":"7a6da11b-1eb4-c14d-52fa-753f63cc277b","name":"hooks.alt.js","type":2},{"id":"6a249393-70fe-4368-53c1-f23fb23f37aa","name":"hooks.js","type":2},{"id":"8724fbde-3143-2c67-77f0-aaa18461661b","name":"Makefile","type":2},{"id":"dc9cde5c-b39f-fe45-3aca-75ee99965ae1","name":"package.json","type":2},{"id":"eaf211fa-37e2-2d35-e9d7-1d00d3238071","name":"README.md","type":2},{"id":"f8643db5-2767-cbf4-32c6-9b99aac256c1","name":"test.js","type":2}]},{"id":"320d62bf-6d0a-7568-0f1f-1b42a63a5236","name":"mongodb","type":1,"children":[{"id":"f14d6da6-3ff6-e257-dc93-7e9923476de8","name":".travis.yml","type":2},{"id":"a310dde4-d4df-c9d6-7951-379d0ce02867","name":"CONTRIBUTING.md","type":2},{"id":"8a64a54f-20ad-551b-bae1-74c5ff9da25c","name":"index.js","type":2},{"id":"2f877cbd-ed1d-b703-7257-d83fceed45de","name":"install.js","type":2},{"id":"e11f4b13-4ae7-11ee-7700-82c7065ec9f1","name":"lib","type":1,"children":[{"id":"c0ca9105-d61f-4d0c-162f-096057406e2e","name":"mongodb","type":1,"children":[{"id":"eeb08d93-0ebd-cedd-bb50-ad769931591c","name":"admin.js","type":2},{"id":"e38f5eb8-91f4-e16e-2606-4574478d0acd","name":"collection.js","type":2},{"id":"42579be8-d9b8-5196-4b04-89237be46130","name":"commands","type":1,"children":[{"id":"2f9b162a-66be-fb19-93d1-d73aa1201a61","name":"base_command.js","type":2},{"id":"b9740a27-a7f6-c073-576e-d40ebd8ee445","name":"db_command.js","type":2},{"id":"f87d582f-fb30-ffa4-6243-904b7437eab4","name":"delete_command.js","type":2},{"id":"40caabfe-5300-c25c-0319-57d774cd30e0","name":"get_more_command.js","type":2},{"id":"a1c00589-ebca-698e-9e44-9b126049bdeb","name":"insert_command.js","type":2},{"id":"40f97e9e-0f3a-c8bf-29ef-b217ea7e07df","name":"kill_cursor_command.js","type":2},{"id":"2de80ca7-0563-5f5a-b4eb-e99288cad762","name":"query_command.js","type":2},{"id":"12c4ba80-eb71-83e9-73f3-152c83ded97e","name":"update_command.js","type":2}]},{"id":"fb39dba3-88be-c251-7dd4-75b0cdddfa1c","name":"connection","type":1,"children":[{"id":"616a5b14-6cd5-76a8-12c7-281cc65269f7","name":"base.js","type":2},{"id":"21fbc484-25f5-0eb8-178d-7cc8b03519e1","name":"connection.js","type":2},{"id":"a218887a-0a10-3095-650a-ca7faeb2b925","name":"connection_pool.js","type":2},{"id":"08e509b9-eebc-82ba-4070-3b355dea16a5","name":"connection_utils.js","type":2},{"id":"ad6c7dcc-34d3-64a6-7eb8-6ae1cfc3d276","name":"mongos.js","type":2},{"id":"ab43dad8-1fe8-648d-a419-a6abb2cc4f52","name":"read_preference.js","type":2},{"id":"768c2a18-aa4e-6de9-33c4-3b9d47f3d81a","name":"repl_set.js","type":2},{"id":"83f07410-66e0-36f2-a151-856bff8a48f6","name":"server.js","type":2},{"id":"fe7aba45-4ebe-10dd-35f0-cf1a0fbe1e73","name":"strategies","type":1,"children":[{"id":"2b98def5-e3d9-bb04-d013-968416a7b709","name":"ping_strategy.js","type":2},{"id":"540e78d0-6644-7d72-148f-2b19effcc548","name":"statistics_strategy.js","type":2}]},{"id":"9a9a078b-881a-381d-d358-07b44dd69a3c","name":"url_parser.js","type":2}]},{"id":"63116729-b08e-9d33-5ae3-b03e15ee8880","name":"cursor.js","type":2},{"id":"2fdebda8-25b2-28e4-eec3-d84a6ddc0013","name":"cursorstream.js","type":2},{"id":"7104c68e-a417-fdb6-da5a-0350d81035c5","name":"db.js","type":2},{"id":"56e8f134-4ca1-12a8-9b56-e193c1085e06","name":"gridfs","type":1,"children":[{"id":"22952e75-40d7-b809-cc7d-6427d4cf8b0e","name":"chunk.js","type":2},{"id":"65ac271d-f958-68f8-87d1-0a7659ab17dd","name":"grid.js","type":2},{"id":"5ce57c70-f2d4-b41c-5b40-c891a7686f91","name":"gridstore.js","type":2},{"id":"59c79798-5552-5bbc-cfe1-8b029a7efed0","name":"readstream.js","type":2}]},{"id":"6083829e-b541-5f3b-8ec2-150034d35947","name":"index.js","type":2},{"id":"8f56d452-7559-d98e-498e-1ff33b5dc365","name":"mongo_client.js","type":2},{"id":"ce11b32d-e925-e849-7c4c-45986f6eed7e","name":"responses","type":1,"children":[{"id":"304e261a-6bf3-4090-fd48-0cbff04fbd93","name":"mongo_reply.js","type":2}]},{"id":"272cb1c5-ad44-3a81-222f-30d214aa5593","name":"utils.js","type":2}]}]},{"id":"1b29c792-520b-08f9-212a-98d10e39753c","name":"Makefile","type":2},{"id":"0f689990-38cb-91ac-e740-807fafc6f251","name":"node_modules","type":1,"children":[{"id":"5f7ad144-ab42-2812-866e-208d9c178009","name":"bson","type":1,"children":[{"id":"1f2f03b1-afa1-2546-731e-4fb3057aa63b","name":".travis.yml","type":2},{"id":"4c205f1b-61a2-6dae-1d66-0f512933a1ea","name":"benchmarks","type":1,"children":[{"id":"18b651ab-4f8c-8771-c216-9f0be8c7e8c4","name":"benchmarks.js","type":2}]},{"id":"9244eb29-fa56-b93f-998b-865835dd7ff8","name":"binding.gyp","type":2},{"id":"25d656dc-4cd8-7300-c7d3-54a2c1929f2c","name":"browser_build","type":1,"children":[{"id":"2dfc5f5c-78da-f781-4ffb-19fd3230ccaf","name":"bson.js","type":2},{"id":"8f2a569a-5c70-e2eb-16c2-7d6bd534e53a","name":"package.json","type":2}]},{"id":"1335402d-147e-921b-f3e2-ccee560c4715","name":"builderror.log","type":2},{"id":"7643defe-7b16-f73b-4f2b-e58e6b80be97","name":"build_browser.js","type":2},{"id":"b630d7ce-71e1-c522-3841-5911b75f2573","name":"ext","type":1,"children":[{"id":"132c28e5-ade6-98f3-b058-1fb27fc79ff2","name":"bson.cc","type":2},{"id":"6e2a2cd5-584d-9100-9b79-2677a1ec3574","name":"bson.h","type":2},{"id":"766acbb1-5eb4-9178-721f-4266b1dd4243","name":"index.js","type":2},{"id":"964f5d90-0618-ed81-1e9b-eff9d9d14faa","name":"Makefile","type":2},{"id":"467a190e-85ce-f0f9-9ef9-3867c32130b2","name":"win32","type":1,"children":[{"id":"d2537546-4569-f344-cd5d-a22ab3ab4608","name":"ia32","type":1,"children":[{"id":"eed7d366-c8ba-c633-03d9-5e9414679045","name":"bson.node","type":2}]},{"id":"8e8abafb-c4a1-1f3b-c896-31195657e15d","name":"x64","type":1,"children":[{"id":"51c8c12e-86f1-431e-e1b5-6ab33b9e74c8","name":"bson.node","type":2}]}]},{"id":"b2460855-289e-6db9-9b97-8bd72b55ba20","name":"wscript","type":2}]},{"id":"f237a59a-cdd4-2bd5-8edf-640a9bcc3830","name":"lib","type":1,"children":[{"id":"901bbeea-d301-eb54-09af-c37df46796dc","name":"bson","type":1,"children":[{"id":"aa1fa6f8-3e7e-7512-3d1a-71d4534d1879","name":"binary.js","type":2},{"id":"4b78a74b-7e17-5214-a0c3-bfa201ab3264","name":"binary_parser.js","type":2},{"id":"1010a5f7-23ca-b825-39c6-a82753988df1","name":"bson.js","type":2},{"id":"24c847fc-89ae-4e8d-b2f8-f85840cddf2c","name":"code.js","type":2},{"id":"2dc21b5b-4e05-614f-b5b4-6056d057139b","name":"db_ref.js","type":2},{"id":"1611bfb1-9e9e-4818-6869-29aac525537d","name":"double.js","type":2},{"id":"800be112-2c9e-10a3-b2e5-655a5528f10b","name":"float_parser.js","type":2},{"id":"f5a14264-2418-9178-bb02-06a569d19b83","name":"index.js","type":2},{"id":"a99ec869-a7f1-c623-2b6b-fe928cfd6404","name":"long.js","type":2},{"id":"b34aff17-a491-3561-d1bb-4a867947c73c","name":"max_key.js","type":2},{"id":"2a56fe9f-cd34-5a7a-ac62-54125dd21344","name":"min_key.js","type":2},{"id":"3743d852-0aa7-2b88-7537-fa135b35241e","name":"objectid.js","type":2},{"id":"e543e127-ee41-96e0-7e8d-9f47e9e56b80","name":"symbol.js","type":2},{"id":"1f330376-3c47-417f-04cb-e8ce1c7bab9d","name":"timestamp.js","type":2}]}]},{"id":"434df4e6-ee17-7b67-5b96-fab567705f5b","name":"Makefile","type":2},{"id":"5f035683-2101-d4d6-95d9-b7c07ddb4e60","name":"package.json","type":2},{"id":"712f0f39-cb2d-73ec-82ef-7408138aa9f5","name":"README.md","type":2},{"id":"850ee9dc-f9cc-d388-22fb-54cdf04be9b1","name":"test","type":1,"children":[{"id":"1a66fd0f-6b10-ae66-9171-3b7834ba8f36","name":"browser","type":1,"children":[{"id":"ba51a5c8-7fd3-4195-046f-d6e41f28103e","name":"browser_example.htm","type":2},{"id":"685c6851-b719-dab7-cc03-7b700a08e013","name":"bson_test.js","type":2},{"id":"f217d5e7-1247-f18f-98f8-16446ac01fbe","name":"nodeunit.js","type":2},{"id":"eec7abdf-73b2-cb25-66c1-74f414d0485a","name":"suite2.js","type":2},{"id":"1411c503-c0bc-136a-564f-afe7e486d898","name":"suite3.js","type":2},{"id":"83c6946b-3513-7eec-723e-be482261a5e6","name":"test.html","type":2}]},{"id":"d684b1ae-4514-d3fc-1eaf-7c7093efff6f","name":"node","type":1,"children":[{"id":"5ab6d484-ec8c-bac3-9ada-eeb40518f0ac","name":"bson_array_test.js","type":2},{"id":"bb888fd2-6530-3610-d2be-b761b275b8cb","name":"bson_parser_comparision_test.js","type":2},{"id":"aa74f892-7c3e-1546-c60a-516fd6fd68d1","name":"bson_test.js","type":2},{"id":"e5d714b1-b13e-98e3-05af-e11c513011f5","name":"bson_typed_array_test.js","type":2},{"id":"7e4213e2-cb14-8e98-23ef-3830f1c1947c","name":"data","type":1,"children":[{"id":"ff54f751-5aac-d2ee-ca8d-a2cd377c089e","name":"test_gs_weird_bug.png","type":2}]},{"id":"01a7889e-ab42-b46b-e32b-78c71d9cfd2e","name":"test_full_bson.js","type":2},{"id":"f8b00285-0ae5-396a-77c0-9373f9e78a0c","name":"tools","type":1,"children":[{"id":"5c9012ec-06cb-fd39-1b84-67a51dc0f036","name":"utils.js","type":2}]},{"id":"5ec77cc7-e7c3-ef76-2034-fa7eb9a7040f","name":"to_bson_test.js","type":2}]}]},{"id":"2229f874-b181-e62c-7119-3ae49a147e01","name":"tools","type":1,"children":[{"id":"61960be7-5585-7ef7-9e4e-7ca9e37db160","name":"gleak.js","type":2},{"id":"8925cdf8-3f61-dcce-c483-603bd051d260","name":"jasmine-1.1.0","type":1,"children":[{"id":"d6a48681-325a-8f04-cee2-43fc70d0d6b3","name":"jasmine-html.js","type":2},{"id":"050fc0cc-421d-25c3-52a3-aeb185e4d1f9","name":"jasmine.css","type":2},{"id":"09db24c6-3b2e-50b4-f77d-dfe2c0444c36","name":"jasmine.js","type":2},{"id":"6501e4b8-a2d0-c75c-5792-152693f85edd","name":"jasmine_favicon.png","type":2},{"id":"26021564-40e5-f7c2-5ffe-d6543bfe219f","name":"MIT.LICENSE","type":2}]}]}]}]},{"id":"d5232009-849d-2fbb-f427-caf687c87403","name":"package.json","type":2},{"id":"44ee71c6-5c57-03dd-8242-2a19e9473cf2","name":"Readme.md","type":2},{"id":"530fae62-ea22-71d3-d118-2ffc056adff3","name":"upload.py","type":2}]},{"id":"e0fc0152-591e-59d4-3146-34c1a9e5897f","name":"ms","type":1,"children":[{"id":"a8450e93-d906-650d-1d27-22d1facbd958","name":".npmignore","type":2},{"id":"3c9a5a33-829f-d72e-d8b9-ef46cbaafe00","name":"Makefile","type":2},{"id":"cecd99d1-ed30-0b52-97c1-9c21c449b0fa","name":"ms.js","type":2},{"id":"572b56e2-06df-3280-5d09-8d7ee150327b","name":"package.json","type":2},{"id":"94724797-f0c7-c05f-b477-88f7070f0dba","name":"README.md","type":2},{"id":"2ad815d5-c40c-182c-f2bc-40483347b3eb","name":"test","type":1,"children":[{"id":"7c4807a1-d786-98fe-620e-d67416da726a","name":"index.html","type":2},{"id":"62d8180f-0905-d49c-86e1-20065147104e","name":"support","type":1,"children":[{"id":"21ed76aa-336f-b4b2-51f1-7c7ba18dfa50","name":"jquery.js","type":2}]},{"id":"d4c22d03-8fb3-9288-8c60-43b5d9bd5058","name":"test.js","type":2}]}]},{"id":"dc3bf03b-e6f2-1702-f765-ad78df78f9c6","name":"muri","type":1,"children":[{"id":"36345360-0ca9-9e97-69e9-c487c8c4c160","name":".npmignore","type":2},{"id":"e070905a-54d7-43a5-3c2e-2560fdd93d95","name":".travis.yml","type":2},{"id":"3ccaea2d-5177-aadc-81f0-460b222f4c0f","name":"History.md","type":2},{"id":"ca65560a-28dc-73a8-2437-321d8356556d","name":"index.js","type":2},{"id":"ef2b31ac-e0e2-7f0b-350e-140e66694752","name":"lib","type":1,"children":[{"id":"a6ce4955-4aba-c119-5c76-712cdd9f544b","name":"index.js","type":2}]},{"id":"f6edcc2b-513b-8e89-af93-f3729ab406b5","name":"LICENSE","type":2},{"id":"481d31b5-9fc6-2594-c330-00e99ef40d7e","name":"Makefile","type":2},{"id":"5315dc2e-9873-6c24-aa9e-756cd2bd3a48","name":"package.json","type":2},{"id":"36325383-5dae-7489-190e-f20b8d3ffd12","name":"README.md","type":2},{"id":"ba729eb3-6f24-abab-9ade-cc4c59392b7e","name":"test","type":1,"children":[{"id":"50161ac8-01ad-bd0a-8e07-648464158926","name":"index.js","type":2}]}]},{"id":"472b94ff-af9e-066b-9a12-51da1d2ec393","name":"sliced","type":1,"children":[{"id":"3fdecc48-d4c8-de4b-4d37-f2136bc0887d","name":".npmignore","type":2},{"id":"a72fc07d-9dea-e295-f8e5-4548678a42c4","name":".travis.yml","type":2},{"id":"f6625ed6-e2b8-cd40-9965-a5f8c6fd4cb3","name":"bench.js","type":2},{"id":"d62d56d8-ae0c-8588-010f-913c9d4762a3","name":"History.md","type":2},{"id":"5cef84ef-7d2d-aa6f-29d5-57f054625f0d","name":"index.js","type":2},{"id":"2f13002b-e6bc-6638-911b-df34b4b9b132","name":"lib","type":1,"children":[{"id":"5b1c057b-382a-ef72-607c-1f9e472b65bd","name":"sliced.js","type":2}]},{"id":"f552d8e7-59dc-d74f-483d-81db3dbd05ab","name":"LICENSE","type":2},{"id":"4ac9c4e6-60c7-8bef-0192-6735dc1499e9","name":"Makefile","type":2},{"id":"0d0b0564-ca88-6fa9-97bf-05a9e6f969dd","name":"package.json","type":2},{"id":"b5b3570e-1e86-444b-f905-94081aa64083","name":"README.md","type":2},{"id":"a616411a-4068-a67f-407b-eb477672516e","name":"test","type":1,"children":[{"id":"616567c1-6aea-814e-d34c-2ea210016461","name":"index.js","type":2}]}]}]},{"id":"b43a25d5-1e0b-67df-eb07-49c650cff407","name":"package.json","type":2},{"id":"2f6dfa6d-6b86-a63b-0f5d-f574062c1cab","name":"README.md","type":2},{"id":"ce9b10cf-cb82-2792-264f-1ebf50d42311","name":"static.js","type":2},{"id":"2eff9167-a760-6c8b-e9e3-f24782333de2","name":"website.js","type":2}]},{"id":"a4567a4e-b1d7-93b8-b24f-b70da8a4f17f","name":"should","type":1,"children":[{"id":"9a634cc8-fdea-5f3c-ea65-1bfce9b5af28","name":".gitmodules","type":2},{"id":"257acf01-7213-e929-be1e-d500d0ca2106","name":".npmignore","type":2},{"id":"915c8078-fd67-348e-393e-3eb25319d1e6","name":"examples","type":1,"children":[{"id":"af7fd20a-a90a-b739-4a23-b3ad9262811a","name":"runner.js","type":2}]},{"id":"173a30d8-bde0-346c-e22d-354daebb001e","name":"History.md","type":2},{"id":"ed7b6a7d-424a-3a5a-ef0d-5b8451d88ed5","name":"index.js","type":2},{"id":"1615ff91-8ecf-cfc7-0bd9-33b7dfbbbbbe","name":"lib","type":1,"children":[{"id":"167929ae-ef81-aed0-4487-dbfe38616393","name":"eql.js","type":2},{"id":"3d92dc40-af4a-d852-3df7-bafd96274c68","name":"should.js","type":2}]},{"id":"02d364e1-e421-be1b-4b05-009b3ad022d8","name":"Makefile","type":2},{"id":"2c3eb7d5-ffa9-314c-56a4-a0f96ffbfe2b","name":"package.json","type":2},{"id":"0bc30c79-75ff-a356-5e7d-e8ff02bfb596","name":"Readme.md","type":2},{"id":"4803e168-5ef2-f2db-e6eb-0c13544e80cb","name":"test","type":1,"children":[{"id":"db48840b-ea57-56f4-5869-653038780565","name":"exist.test.js","type":2},{"id":"b2f24985-b679-7136-556c-1fa490f77a81","name":"should.test.js","type":2}]}]},{"id":"9d646073-cdb6-cd09-c0cb-d942e03d412d","name":"socket.io","type":1,"children":[{"id":"d25a9134-1985-bd10-0b6a-ede2a8c28802","name":".npmignore","type":2},{"id":"9047a89a-0b0f-5957-4124-bf44347bdbb6","name":"benchmarks","type":1,"children":[{"id":"d3126969-c342-4e2c-c91e-82f3e506edd0","name":"decode.bench.js","type":2},{"id":"4002f38d-5c0b-df3c-2854-c03a138a3070","name":"encode.bench.js","type":2},{"id":"81ba5cd6-a6f7-4ca2-5731-7c1b49b4e5ae","name":"runner.js","type":2}]},{"id":"d932b02a-5e30-1b2e-2edf-027b32b13ae8","name":"History.md","type":2},{"id":"ed930849-044f-dace-98cf-a162f3142b9a","name":"index.js","type":2},{"id":"7377b71b-7e6e-9873-ab39-12ba7328f0a0","name":"lib","type":1,"children":[{"id":"5dfa77ea-59bc-88c2-cd78-a09e31a1cbaa","name":"logger.js","type":2},{"id":"a56f3707-ed1b-91b9-365e-69316b993b2a","name":"manager.js","type":2},{"id":"f9629191-720a-d8b5-5629-2ad47dc26a51","name":"namespace.js","type":2},{"id":"13fe34bd-b9c1-7e04-d57d-1c5c48dc9125","name":"parser.js","type":2},{"id":"b8d37120-5771-9413-4622-90f367b7d211","name":"socket.io.js","type":2},{"id":"64fda527-2ace-c3d1-d488-ce28b6994cc8","name":"socket.js","type":2},{"id":"3b509b09-74bc-627c-18a0-1da364c95e35","name":"static.js","type":2},{"id":"a0957e5b-fe97-1ad8-cc14-86770c662850","name":"store.js","type":2},{"id":"79c74a81-e3d6-85f5-7a8a-d5588eada887","name":"stores","type":1,"children":[{"id":"5354984b-30ab-0840-1185-d6420f7348e0","name":"memory.js","type":2},{"id":"bce62d2f-62a9-3781-1442-4631bfae40fa","name":"redis.js","type":2}]},{"id":"f059cb78-d7d0-a72b-5fdf-68ab1a635c2b","name":"transport.js","type":2},{"id":"ee35e3b5-eb2a-4695-961c-384ace5ff2b5","name":"transports","type":1,"children":[{"id":"91471582-273c-2e82-a659-79399a248888","name":"flashsocket.js","type":2},{"id":"b372b381-5939-4845-3a58-af8365e75717","name":"htmlfile.js","type":2},{"id":"d20f0722-3ef0-5914-0c4b-a647edf4b50e","name":"http-polling.js","type":2},{"id":"1af66e2a-d237-a5f6-00b0-e7bd4445cc3c","name":"http.js","type":2},{"id":"83a351cd-e83f-649c-0aa5-7c82a50115e1","name":"index.js","type":2},{"id":"0921378a-e8c6-ba10-45e7-bd1f34a5ccbf","name":"jsonp-polling.js","type":2},{"id":"e238949e-6409-c11a-c2ec-24a98e52b862","name":"websocket","type":1,"children":[{"id":"35e857b6-96d8-e404-3923-7d55f82828e2","name":"default.js","type":2},{"id":"9ab2e63e-8167-dc52-c705-96e1ccd8d265","name":"hybi-07-12.js","type":2},{"id":"10b36f33-c49b-4bfd-e105-24f1df88deb1","name":"hybi-16.js","type":2},{"id":"f6673cc4-f485-a4d0-db54-fea8519c72d4","name":"hybi-17.js","type":2},{"id":"4ef3b230-705f-ccd7-d984-8650c54a651c","name":"index.js","type":2}]},{"id":"9f8df618-59c2-465e-3b6b-442b14f6328c","name":"websocket.js","type":2},{"id":"dd331fbe-b578-1668-0b18-8920b79db1e1","name":"xhr-polling.js","type":2}]},{"id":"038a75ab-46df-1766-88f6-93e6925e252f","name":"util.js","type":2}]},{"id":"ef65cd1d-3a13-a941-5f98-3df23473dc06","name":"Makefile","type":2},{"id":"ebd3399c-dcf5-6d23-c580-cbf2dbc3798a","name":"node_modules","type":1,"children":[{"id":"56bdf4f7-8716-b46d-4424-78919543dd05","name":"policyfile","type":1,"children":[{"id":"8b848433-6652-7ff3-8711-64701c1edfd6","name":".npmignore","type":2},{"id":"4e3e2378-c29f-6eb1-4be2-17f83fae57c5","name":"doc","type":1,"children":[{"id":"5d2d8fae-0588-c30f-4164-914c90592144","name":"index.html","type":2}]},{"id":"93576c64-a521-2132-34ec-434d628e4532","name":"examples","type":1,"children":[{"id":"74832a3f-fac3-d5ea-a372-ee9f3e60f628","name":"basic.fallback.js","type":2},{"id":"0df5521c-3970-37e5-d8cd-3e6aef649e9b","name":"basic.js","type":2}]},{"id":"6d684a7a-9385-8706-46e1-3fed8aa9010a","name":"index.js","type":2},{"id":"9f02bf4b-6600-e8e4-8f76-cafa5f5c5d40","name":"lib","type":1,"children":[{"id":"ba4f687d-dd15-06f3-0387-bd6abe00a727","name":"server.js","type":2}]},{"id":"f3c439b7-8a18-d8bf-cd6f-465c858c07d8","name":"LICENSE","type":2},{"id":"657ad5e4-9804-0615-15d1-9c48eae7dd81","name":"Makefile","type":2},{"id":"b978761a-0197-d7dd-5c5c-cc9a1934f08c","name":"package.json","type":2},{"id":"0a8c0a73-9622-d3cb-f6c9-09c61e8ddb05","name":"README.md","type":2},{"id":"19a8fef8-51e9-8007-10ac-40e51a1fa2b0","name":"tests","type":1,"children":[{"id":"90e88234-db5c-0c56-7c5e-e336624cc365","name":"ssl","type":1,"children":[{"id":"0e76950f-ce7d-4016-979e-d6beb5fbac60","name":"ssl.crt","type":2},{"id":"7f6f2bfc-8e54-6cdf-a7f5-ffa87a6ccf72","name":"ssl.private.key","type":2}]},{"id":"887e8d72-ca68-bb50-8888-75514202bf06","name":"unit.test.js","type":2}]}]},{"id":"4474c9d6-037f-950a-9c12-a6b15cd67bbc","name":"redis","type":1,"children":[{"id":"e0216a58-b801-aee0-ab20-4a5e0ba5b27f","name":"changelog.md","type":2},{"id":"70373ab2-a8e5-8361-167a-8508264f7486","name":"eval_test.js","type":2},{"id":"21a01a6d-ee75-bb79-487e-f2f47feb9d1d","name":"examples","type":1,"children":[{"id":"ef4749ce-33c9-966e-b6e5-67e1aa953932","name":"auth.js","type":2},{"id":"722311c5-cc08-e401-cb0d-10af0842e4e8","name":"backpressure_drain.js","type":2},{"id":"c774b007-734b-73ab-20f1-f5a9d2268b34","name":"extend.js","type":2},{"id":"afc754b5-8a28-eb43-a2fe-9c9d6c3f2129","name":"file.js","type":2},{"id":"ea09d510-c457-4eee-1ca5-9605fe984521","name":"mget.js","type":2},{"id":"06452b5a-5300-749f-0e8c-302f60b5b6df","name":"monitor.js","type":2},{"id":"fa2c069a-5e97-6838-f79f-732c186c0daa","name":"multi.js","type":2},{"id":"95f066d6-bdfb-dc90-2167-c414eb5eaba0","name":"multi2.js","type":2},{"id":"531e1f9f-ae81-9262-321a-1349bf529dc5","name":"psubscribe.js","type":2},{"id":"262b0086-43bb-dbf1-cdc0-a13ec2a79115","name":"pub_sub.js","type":2},{"id":"e1a469c6-26cf-52f4-0f23-410605d4968e","name":"simple.js","type":2},{"id":"f59c0ba6-9adf-6a26-c59b-760bc471a9d1","name":"subqueries.js","type":2},{"id":"9ae8ad95-b1d0-b48c-4e04-afb5bbbdafd8","name":"subquery.js","type":2},{"id":"19811327-f636-8ffb-3d4d-cf2b642b3a75","name":"unix_socket.js","type":2},{"id":"4a337207-59bf-0407-5b25-221623ed0815","name":"web_server.js","type":2}]},{"id":"93c2ac2b-ea83-23bc-07a5-476a139c5af5","name":"generate_commands.js","type":2},{"id":"d614a9b7-83a9-8962-1c8f-b984aab0b381","name":"index.js","type":2},{"id":"d9de5ba1-49e8-0ec7-f708-cec73928ca75","name":"lib","type":1,"children":[{"id":"c6d1a0f6-e2fc-7c3a-bc33-9a0c4355b9c8","name":"commands.js","type":2},{"id":"4be0ebb5-cc10-2019-8d16-8986ed1ede47","name":"parser","type":1,"children":[{"id":"4e80e341-0d74-e3b8-2966-157422f7910b","name":"hiredis.js","type":2},{"id":"0f02e94c-d602-3dd3-c28c-ee23a23732dd","name":"javascript.js","type":2}]},{"id":"1d5f0b46-f36e-3d87-cf80-9a85e1e1805e","name":"queue.js","type":2},{"id":"68f01936-8108-49d6-2638-e2484d7de2c3","name":"to_array.js","type":2},{"id":"68583e22-51ae-29f1-ae66-1fe052acc464","name":"util.js","type":2}]},{"id":"47687218-c8db-855c-9482-45fe9947a5fa","name":"multi_bench.js","type":2},{"id":"43de731b-93ed-67e6-947e-eabbefe361a4","name":"package.json","type":2},{"id":"b9bcd816-a9d5-cfbd-de87-65f2d4c5a441","name":"README.md","type":2},{"id":"cf98d355-0292-a066-6db0-52967c0a6747","name":"simple_test.js","type":2},{"id":"d92e1003-4c8e-166d-766c-992ddeb1ad3e","name":"test.js","type":2},{"id":"3b5e0e7c-1b69-afb2-a1f2-2baed8684d72","name":"tests","type":1,"children":[{"id":"f28be148-9087-99c1-779a-aad7da219c89","name":"buffer_bench.js","type":2},{"id":"d6322b38-7180-d0a3-6ce0-effdb3ee8709","name":"reconnect_test.js","type":2},{"id":"4fea72b6-91b5-e4e2-2faa-b0f1283d3df0","name":"stress","type":1,"children":[{"id":"a81937eb-20d9-2210-d276-c2367c653372","name":"codec.js","type":2},{"id":"8c71342e-5560-bc42-bde5-079249e4d9d2","name":"pubsub","type":1,"children":[{"id":"68bce7fd-0402-2416-5c65-d581e2f28564","name":"pub.js","type":2},{"id":"0c5a0500-d69b-ee88-ad64-7ef539e5ae32","name":"run","type":2},{"id":"98f4c244-775b-4f22-f1ef-4aa22d2e1f19","name":"server.js","type":2}]},{"id":"d5ec06cf-74ca-c111-68df-0e6ab207b426","name":"rpushblpop","type":1,"children":[{"id":"7260009e-3f9c-abd8-e421-e3bb17b514dc","name":"pub.js","type":2},{"id":"86ea90aa-a234-42ab-a335-ff2ab6bfa54b","name":"run","type":2},{"id":"b64e1c46-5989-250a-5900-066cb7737e4c","name":"server.js","type":2}]},{"id":"76e00e19-a354-8f11-764b-3fee387bf4d5","name":"speed","type":1,"children":[{"id":"ce3aac68-eb15-2080-2a13-8cd172dabe2e","name":"00","type":2},{"id":"e2b382ef-92ed-a03e-4b17-c79129e1fffe","name":"plot","type":2},{"id":"2e29dc88-828e-8576-f64b-f5e01c1aa381","name":"size-rate.png","type":2},{"id":"6c96d64b-ab3f-be67-b355-ac89ed3cda56","name":"speed.js","type":2}]}]},{"id":"1cea0be1-1930-085f-b5e1-d396f12ca59b","name":"sub_quit_test.js","type":2},{"id":"bbae0d1a-3d80-4266-fc6a-5cb0e966cc1c","name":"test_start_stop.js","type":2}]}]},{"id":"66273752-e895-ecbe-9f78-8e82bfe89920","name":"socket.io-client","type":1,"children":[{"id":"2f91d8e2-bdd6-0abd-ed42-d667af95e3cd","name":".npmignore","type":2},{"id":"90f88d80-a23d-3570-ca3c-bd807720e620","name":"bin","type":1,"children":[{"id":"af0d4405-e42b-a26c-6868-fb7bb80e6b9a","name":"builder.js","type":2}]},{"id":"aa63ba8a-cdab-d4f9-3ab2-363c8ea8c9b5","name":"dist","type":1,"children":[{"id":"e4ac42ab-8032-9879-109d-8418992130bd","name":"socket.io.js","type":2},{"id":"49058242-2b89-84b9-72cb-fe7a5addb406","name":"socket.io.min.js","type":2},{"id":"323b1aa4-48ec-cb03-74df-8b597bb5b20f","name":"WebSocketMain.swf","type":2},{"id":"d81cbf09-20c3-de04-60f6-8a0d080d6359","name":"WebSocketMainInsecure.swf","type":2}]},{"id":"15f9ef4c-8902-04f5-dc88-8f17a3c2057d","name":"History.md","type":2},{"id":"db30da70-45e0-96c7-d40d-87d5dac6293c","name":"lib","type":1,"children":[{"id":"98c1888f-a6b4-bc48-92b1-60904bc77af5","name":"events.js","type":2},{"id":"9aab8665-b269-701b-4860-b6195ef61624","name":"io.js","type":2},{"id":"44953951-6582-fb07-82fb-2df56f83e58c","name":"json.js","type":2},{"id":"68d87e2a-8cdd-9b78-7e87-893541860de8","name":"namespace.js","type":2},{"id":"b559d7c0-607a-9c17-20a0-dc7b977b9f7b","name":"parser.js","type":2},{"id":"c9c9831f-062e-0876-4fd8-033bc4a3b047","name":"socket.js","type":2},{"id":"32baedc8-f0c8-2a6a-2c8d-204657b9fbe0","name":"transport.js","type":2},{"id":"8f1c7c78-7164-6012-4a9c-520f3f5ad872","name":"transports","type":1,"children":[{"id":"cf2cc4f6-90b0-cad8-1a5a-1efff035ffbb","name":"flashsocket.js","type":2},{"id":"6fb45e87-b63a-aa7e-afcd-74c643e88865","name":"htmlfile.js","type":2},{"id":"325f7783-47fd-2f80-3a59-d7f8a5dc5135","name":"jsonp-polling.js","type":2},{"id":"7e5a2fd7-eae1-cb9f-9261-64152add040a","name":"websocket.js","type":2},{"id":"59bd2cbd-77a5-20b4-3c09-9517bd046a43","name":"xhr-polling.js","type":2},{"id":"3e53e3c5-e8cc-36f8-e30d-041a3edf6543","name":"xhr.js","type":2}]},{"id":"7d896c25-ea7e-bed4-827d-66803ae3f687","name":"util.js","type":2},{"id":"d15a2d3e-de6a-0a9f-27ba-a670ab84000e","name":"vendor","type":1,"children":[{"id":"1d4f7530-7f5d-5f2b-d421-05b9a368d8ef","name":"web-socket-js","type":1,"children":[{"id":"c57185c9-1560-e4da-7290-c9a03d96e0ad","name":".npmignore","type":2},{"id":"148029ef-3875-3095-18c3-8a9ae4f3d947","name":"flash-src","type":1,"children":[{"id":"f5fdf479-bb9d-a15d-14ca-efdac74350e4","name":"build.sh","type":2},{"id":"f1faa9d7-d6f4-22bf-892b-5e25ed494c60","name":"com","type":1,"children":[{"id":"27791c3e-f6ab-4f5a-e830-b2283637393a","name":"adobe","type":1,"children":[{"id":"7adfde3d-9a66-b279-c80f-a42aa9b8520b","name":"net","type":1,"children":[{"id":"cb1deccc-6cb7-fa8b-5d12-953c4cc57f90","name":"proxies","type":1,"children":[{"id":"1af8ee03-9936-5ec4-2351-99e6cddb27e4","name":"RFC2817Socket.as","type":2}]}]}]},{"id":"27ba31b3-793c-e4af-ccd4-ee451ff75146","name":"gsolo","type":1,"children":[{"id":"5dd66587-3490-79f4-d3cf-129d7a52b891","name":"encryption","type":1,"children":[{"id":"ebbdd7dc-8bcc-011a-b5fe-6aa359fbaadc","name":"MD5.as","type":2}]}]},{"id":"1313ea8c-e687-6395-cd87-7764f85ea0c1","name":"hurlant","type":1,"children":[{"id":"82f05cd9-e884-4b9d-c743-5ecc532acdd1","name":"crypto","type":1,"children":[{"id":"df52ed7b-e46d-cd9d-d5ad-3b8640e64397","name":"cert","type":1,"children":[{"id":"19c9e48e-7888-c2a9-9795-90c39f56c470","name":"MozillaRootCertificates.as","type":2},{"id":"386bb58e-aab3-1d79-2526-93c7192bb787","name":"X509Certificate.as","type":2},{"id":"7680dcc4-7b56-759f-7acb-25f541897ad1","name":"X509CertificateCollection.as","type":2}]},{"id":"58a49b2b-7ae1-1d3b-f204-d04b66c4a5c0","name":"Crypto.as","type":2},{"id":"b0964911-2226-ee2b-74d0-add90e32e0ab","name":"hash","type":1,"children":[{"id":"1f4e5221-d8b4-e233-5cec-2b95619dd6bd","name":"HMAC.as","type":2},{"id":"182b5756-ca2c-aa1d-cd4c-88f1d2f4dcf4","name":"IHash.as","type":2},{"id":"09240fa6-8f60-9b6d-a39a-412caf9c42c6","name":"IHMAC.as","type":2},{"id":"63b39dd6-c3e2-1d1e-a903-b4ce2f7e9468","name":"MAC.as","type":2},{"id":"ee33ac04-7d2e-7fc9-1eeb-0dd864ffafa6","name":"MD2.as","type":2},{"id":"4c15092f-9f34-a0a8-1233-01982712730b","name":"MD5.as","type":2},{"id":"15d6ae54-09c7-1603-c3ce-e6bf72e5d692","name":"SHA1.as","type":2},{"id":"2b5cb0c7-711d-90e6-2cff-dc2e4674cfac","name":"SHA224.as","type":2},{"id":"b7d3da2f-e0b2-bd15-7252-2da799795a98","name":"SHA256.as","type":2},{"id":"548df205-0367-7dea-aa2b-9f56486eaa93","name":"SHABase.as","type":2}]},{"id":"a1ac5e5d-7f7f-d3ae-1630-8826e24cbbda","name":"prng","type":1,"children":[{"id":"7ab71106-3f81-cff4-db01-3f73e5436bdc","name":"ARC4.as","type":2},{"id":"41aedf53-0dc9-a7ab-66cc-d572a555f9e6","name":"IPRNG.as","type":2},{"id":"6b57eaaa-0345-8fbb-b016-c7f86f50a29f","name":"Random.as","type":2},{"id":"20c06b08-0068-d5de-ed15-5f4eea870820","name":"TLSPRF.as","type":2}]},{"id":"a6c56dee-3e74-bf13-d18c-444496ae93bf","name":"rsa","type":1,"children":[{"id":"c8409e61-12d6-08a7-d93f-47fe38ea6d38","name":"RSAKey.as","type":2}]},{"id":"cbee701a-3da4-083f-3efe-2edb247c9199","name":"symmetric","type":1,"children":[{"id":"47d50fa0-8985-4d38-33a9-9f9558dc547c","name":"AESKey.as","type":2},{"id":"8d524107-ed4b-2c3c-970f-86f60d83c321","name":"aeskey.pl","type":2},{"id":"3697cccd-46fc-45ae-edf7-c97bd3452b6a","name":"BlowFishKey.as","type":2},{"id":"854f2d94-d5a9-1514-ffdb-f4dcc3f1405f","name":"CBCMode.as","type":2},{"id":"012f583a-d93f-7007-bfa0-2fcc4521a8ed","name":"CFB8Mode.as","type":2},{"id":"8bc8fa33-832b-b39b-79c7-5f825becb7fd","name":"CFBMode.as","type":2},{"id":"dae45852-3848-e6ff-2442-0a38ad0a5cbc","name":"CTRMode.as","type":2},{"id":"2bcf0a71-5809-55f3-3fdd-602c0b6b68e9","name":"DESKey.as","type":2},{"id":"10a270a7-c4eb-9ab4-7cd2-e5f57dd1bb55","name":"dump.txt","type":2},{"id":"7ed74b7b-d5af-6a49-2705-de763dc04330","name":"ECBMode.as","type":2},{"id":"9c93cf1e-262f-3da5-292c-501c5b57bd29","name":"ICipher.as","type":2},{"id":"b6dac0e9-0cc2-26da-b540-7b2c554beeec","name":"IMode.as","type":2},{"id":"c4735a4a-954e-2d22-db60-e845373f2bbb","name":"IPad.as","type":2},{"id":"a821d8f1-ea72-f5db-30d3-2bfd8a409cab","name":"IStreamCipher.as","type":2},{"id":"5e81bd48-62a7-184c-f93f-48aa5aaf95e3","name":"ISymmetricKey.as","type":2},{"id":"b8b2bbdc-7acd-398b-11d8-1a4b27cc0f08","name":"IVMode.as","type":2},{"id":"5486e320-a61a-c7a9-e283-94a5fe8ac884","name":"NullPad.as","type":2},{"id":"58b3a9f9-fd3b-bfbf-434d-c4fbaae4248e","name":"OFBMode.as","type":2},{"id":"123e1a06-c710-362a-e681-6cfda0ff462c","name":"PKCS5.as","type":2},{"id":"e16dd52c-66af-01ad-cc09-5c6f5ce13c7d","name":"SimpleIVMode.as","type":2},{"id":"d3f3f318-2d5a-b671-878d-ad642cb3d706","name":"SSLPad.as","type":2},{"id":"87c2a13f-3de6-23bc-0d0f-2bd3b88735ed","name":"TLSPad.as","type":2},{"id":"f22ed478-be3c-6224-26dc-9158cfa6a384","name":"TripleDESKey.as","type":2},{"id":"aa51fad6-8d34-b8d2-7006-fdf89ded176a","name":"XTeaKey.as","type":2}]},{"id":"ace80936-4e75-2b9f-aa75-e30c60035f4e","name":"tests","type":1,"children":[{"id":"877dc5cc-fdee-80f9-4915-eb0294eb8571","name":"AESKeyTest.as","type":2},{"id":"a85e7729-8c81-e0d0-daeb-575c6b8bb9f7","name":"ARC4Test.as","type":2},{"id":"ad975b13-bdc6-6b6a-d88c-e5c92f086221","name":"BigIntegerTest.as","type":2},{"id":"28cc7235-b29f-7f1f-9809-52c8ae54bb62","name":"BlowFishKeyTest.as","type":2},{"id":"2c4d824a-0554-c2b6-3b11-075abdbce9ae","name":"CBCModeTest.as","type":2},{"id":"2fff1e1b-f29f-7983-8d28-4e0e1547fa5d","name":"CFB8ModeTest.as","type":2},{"id":"4d948ee9-a87a-6c17-0f27-9b15440cc06a","name":"CFBModeTest.as","type":2},{"id":"eeb4a47f-9d3b-2151-5a8e-fe2e352441d5","name":"CTRModeTest.as","type":2},{"id":"0f3d4690-be5f-5c3b-5c75-d82488f95865","name":"DESKeyTest.as","type":2},{"id":"b50503c7-e3b9-7fee-2174-918e00497168","name":"ECBModeTest.as","type":2},{"id":"139519cc-65f1-44af-00ab-20596226836d","name":"HMACTest.as","type":2},{"id":"cc8b66a4-fff4-51a0-fbc5-f4559b933a9f","name":"ITestHarness.as","type":2},{"id":"451605d8-9182-6a84-0a74-d49610889637","name":"MD2Test.as","type":2},{"id":"b6a0d173-96fa-2172-68a0-74bc546fd177","name":"MD5Test.as","type":2},{"id":"c87bdb92-63ef-4da6-b12a-cdcf58eb7e36","name":"OFBModeTest.as","type":2},{"id":"f2cf7366-bff9-134f-9952-7f26efb3db46","name":"RSAKeyTest.as","type":2},{"id":"ccd256b6-f4da-29b6-3302-c9b43c5e3008","name":"SHA1Test.as","type":2},{"id":"465389b0-59c3-da99-c5df-8b28fa947ce5","name":"SHA224Test.as","type":2},{"id":"a619814d-8a95-d8e7-b904-5267c3cb4523","name":"SHA256Test.as","type":2},{"id":"60f01e3a-9956-5853-fc24-4f84ff09a174","name":"TestCase.as","type":2},{"id":"14645b88-c125-ef3c-1efc-c082839c5ae2","name":"TLSPRFTest.as","type":2},{"id":"e4d29876-e54b-667c-aa2a-1be36e15e5ac","name":"TripleDESKeyTest.as","type":2},{"id":"666c225e-3a5b-c275-5fc2-b38341e4cc39","name":"XTeaKeyTest.as","type":2}]},{"id":"0610428f-6d59-2c00-d0ab-2977094bf2e9","name":"tls","type":1,"children":[{"id":"c83142da-4583-ef86-c240-e3360ab6398e","name":"BulkCiphers.as","type":2},{"id":"21f1f8e8-50c5-e9d3-0966-090147f02961","name":"CipherSuites.as","type":2},{"id":"851f8373-70b8-de14-b7c9-91546f7b3774","name":"IConnectionState.as","type":2},{"id":"3c302da6-66af-f6a8-6a4b-53e971cb7e04","name":"ISecurityParameters.as","type":2},{"id":"def1cb7b-dea4-2184-2205-6218d84c9fdc","name":"KeyExchanges.as","type":2},{"id":"a03bb443-ee76-0a12-e1f5-2134fe80023b","name":"MACs.as","type":2},{"id":"70a63225-d3ae-00a1-135c-4b49b4ed4f0a","name":"SSLConnectionState.as","type":2},{"id":"e6f39c85-d447-eaf0-da97-ee5adb131737","name":"SSLEvent.as","type":2},{"id":"85a2cf7b-911c-0e65-22d2-1a5e78b9c29b","name":"SSLSecurityParameters.as","type":2},{"id":"c22dae2f-d6f7-4179-83a8-6c509044b8e6","name":"TLSConfig.as","type":2},{"id":"2826be6e-4ce6-41a7-fb0f-a2293d4f2d75","name":"TLSConnectionState.as","type":2},{"id":"bd6f8dfc-8f2b-68d0-075c-b8a69af8da3b","name":"TLSEngine.as","type":2},{"id":"fba8cee8-91a3-11cb-1604-c6091c19a801","name":"TLSError.as","type":2},{"id":"fa4e6b7d-ca8f-14b8-ead8-772bf218b8a6","name":"TLSEvent.as","type":2},{"id":"a0b8958a-fb81-b849-382f-1b20ef691d5c","name":"TLSSecurityParameters.as","type":2},{"id":"c91b57d3-94aa-a7d4-faf0-96d2d05064af","name":"TLSSocket.as","type":2},{"id":"d3415cdb-9f84-beef-77e6-c25431be8ba5","name":"TLSSocketEvent.as","type":2},{"id":"aba355f0-ec1d-03d3-2e1e-3dac1f08c3dc","name":"TLSTest.as","type":2}]}]},{"id":"ace2101c-6e37-4b6b-e9be-2cf69c6a3ce0","name":"math","type":1,"children":[{"id":"f16c3023-ee33-5a88-1ff9-932533b6e1c7","name":"BarrettReduction.as","type":2},{"id":"0028a1d0-7fdb-d4b8-e1ae-e707ffc072a1","name":"BigInteger.as","type":2},{"id":"d5f1a6ad-96d2-0036-2cda-d41175f6d580","name":"bi_internal.as","type":2},{"id":"13f48f00-90e0-41af-c5f2-4d54a80ae3a8","name":"ClassicReduction.as","type":2},{"id":"37aa475b-1602-69e5-7ac0-6abee2879214","name":"IReduction.as","type":2},{"id":"ce9a553c-b3d0-dad5-642c-cc766af3d240","name":"MontgomeryReduction.as","type":2},{"id":"ce3fc044-0b95-b68a-64c4-ee671e6f3a4f","name":"NullReduction.as","type":2}]},{"id":"e5bd156f-2e49-e07c-42fb-7fc8b575a26d","name":"util","type":1,"children":[{"id":"5537a200-4751-c945-ae5c-e1ea2bffbba0","name":"ArrayUtil.as","type":2},{"id":"27951bb5-763f-7fd8-ab0e-206bba2e0054","name":"Base64.as","type":2},{"id":"9fbf4e05-7460-b7ff-9428-8367e6d3f485","name":"der","type":1,"children":[{"id":"7afffe94-7950-4651-9275-9cf6cd494fbe","name":"ByteString.as","type":2},{"id":"0c18417d-affe-95ff-3405-e98083b8ed8b","name":"DER.as","type":2},{"id":"d5e0886b-9c44-706d-54d1-dc062a6356ce","name":"IAsn1Type.as","type":2},{"id":"c636a862-7134-33fd-1571-854ff1ecad74","name":"Integer.as","type":2},{"id":"84b7852d-f574-5c8f-d7a5-674110eb0066","name":"ObjectIdentifier.as","type":2},{"id":"8d622e65-acd9-04a1-1b4a-851e62016684","name":"OID.as","type":2},{"id":"d2702f35-a167-93c0-eeee-649f896b2513","name":"PEM.as","type":2},{"id":"7db03a08-81f2-6df8-92e9-8ebcc4b10c0c","name":"PrintableString.as","type":2},{"id":"fde03c03-3853-021d-c401-a84806dcde1f","name":"Sequence.as","type":2},{"id":"3a34cfaa-7335-12c7-38fd-a469d6fda3a6","name":"Set.as","type":2},{"id":"aa572a3c-5751-ff3f-2eff-4009364c180d","name":"Type.as","type":2},{"id":"7fb0b103-8abd-7872-3fe6-ec328b164dfd","name":"UTCTime.as","type":2}]},{"id":"691b1421-e4cf-72e5-8ea9-fe51be8e037f","name":"Hex.as","type":2},{"id":"0ecfbf0a-d6c8-07ac-259f-981a9e0eab6c","name":"Memory.as","type":2}]}]}]},{"id":"3ac49a89-7cb1-2f52-c32d-09cd15a70b1b","name":"IWebSocketLogger.as","type":2},{"id":"f3fad54a-5e2a-31e0-7f88-49aec91d16a2","name":"WebSocket.as","type":2},{"id":"78402867-cc06-1fda-556d-e5482470248d","name":"WebSocketEvent.as","type":2},{"id":"f2ec0552-88e3-5480-dbe9-262a71405034","name":"WebSocketMain.as","type":2},{"id":"443996fb-1dbf-32ef-8c03-171ee230cdbb","name":"WebSocketMainInsecure.as","type":2}]},{"id":"44434e3e-c28a-521c-1290-c8136b38ea7b","name":"README.md","type":2},{"id":"7d5f1716-6d8c-10d2-f7d2-4594745ca9f8","name":"sample.html","type":2},{"id":"645a0382-9017-c842-9d5d-4cf349966322","name":"swfobject.js","type":2},{"id":"aeb936c3-76d8-9b6d-555f-441c34e15f90","name":"WebSocketMain.swf","type":2},{"id":"53b46c01-c356-4d8b-c173-0a4bef8787dd","name":"WebSocketMainInsecure.zip","type":2},{"id":"52fe82c2-f6d4-162f-38b9-4488f09915f4","name":"web_socket.js","type":2}]}]}]},{"id":"34df58db-36bc-dc80-deda-9fcb084d0c23","name":"Makefile","type":2},{"id":"8c48b483-e4d7-6f92-8e99-8753bdad2610","name":"node_modules","type":1,"children":[{"id":"940c0f2d-527b-33ae-ffc9-fec19ba15a5f","name":".bin","type":1,"children":[{"id":"ac4179c2-8751-e1bc-5f85-8495897e20f3","name":"uglifyjs","type":2},{"id":"e3ba99e9-2106-fef7-3046-eff40ec87e8d","name":"uglifyjs.cmd","type":2}]},{"id":"79558783-0816-1a96-9d42-83717770008d","name":"uglify-js","type":1,"children":[{"id":"5fe4c2cb-e7e8-a18c-8355-62a619fe7ec7","name":".npmignore","type":2},{"id":"2b83ad9c-1b55-a1b6-5f9d-83365df8951b","name":"bin","type":1,"children":[{"id":"966ff5ba-7ad4-4f2d-ce89-a8d45a3dff87","name":"uglifyjs","type":2}]},{"id":"b4541fb5-3982-642f-9950-66552046eaed","name":"docstyle.css","type":2},{"id":"8ae2d999-48b6-c26e-4c6e-2caf9e772d7b","name":"lib","type":1,"children":[{"id":"611b8628-40dd-b87b-f516-2367458a33a2","name":"parse-js.js","type":2},{"id":"cd7b2350-5f8c-0d9c-c277-417166975cef","name":"process.js","type":2},{"id":"a9ba9767-9e5c-3541-d207-696e4b8d634d","name":"squeeze-more.js","type":2}]},{"id":"d66aee04-a9cb-7d4e-5975-6525634bdd8d","name":"package.json","type":2},{"id":"0fe3f069-21fd-3d0e-a2b8-d5aff3da0fcd","name":"README.html","type":2},{"id":"c2736beb-54cf-7b5f-8494-91436e39c8a8","name":"README.org","type":2},{"id":"6fa2b56c-c24d-6119-c7ac-04cf43c14208","name":"test","type":1,"children":[{"id":"161a07a9-84d3-cc55-d57b-55e646015df2","name":"beautify.js","type":2},{"id":"9c0fc133-dcdd-ac51-f086-d4d84c9f4676","name":"testparser.js","type":2},{"id":"a17b0a20-d77b-ac35-0e92-3982dc5241ba","name":"unit","type":1,"children":[{"id":"3389f7a2-10c0-966c-1e5f-abba244622e0","name":"compress","type":1,"children":[{"id":"c0659264-9052-1c12-f2ee-a390fadb734b","name":"expected","type":1,"children":[{"id":"292447ba-ee58-f97f-fd33-41aaea53eb3c","name":"array1.js","type":2},{"id":"4d41428b-9937-1d1a-43e4-e75f0f8c7ba6","name":"array2.js","type":2},{"id":"60dd0b17-a40e-2355-7183-4b5b1b5e9779","name":"array3.js","type":2},{"id":"57cb1018-0372-2c65-5954-e58c1b4a233a","name":"array4.js","type":2},{"id":"6aecfcf4-655a-f892-454c-614a2ab3f421","name":"assignment.js","type":2},{"id":"52d02ce6-c08c-03b9-948f-97ebb405fbdf","name":"concatstring.js","type":2},{"id":"9700b5da-ae7d-b6c7-c9d4-82c5b89117f5","name":"const.js","type":2},{"id":"ab8b60e8-4d49-62af-45f3-56856d10c50e","name":"empty-blocks.js","type":2},{"id":"6dd0018f-9a85-f602-7d63-fc1b0cfbb0e4","name":"forstatement.js","type":2},{"id":"2568dc84-68c8-64fa-e730-c86d8915702e","name":"if.js","type":2},{"id":"5383b53a-ff0a-93f2-415e-fb945817aa5b","name":"ifreturn.js","type":2},{"id":"7a1010cc-3706-2ebe-d6bb-750a08d04b25","name":"ifreturn2.js","type":2},{"id":"dde074fb-a698-8efe-bff0-86bee6c3f0a3","name":"issue10.js","type":2},{"id":"0cf75478-5aa4-40a2-5cae-a331d0e14752","name":"issue11.js","type":2},{"id":"a0ccbbf8-904a-7b62-479c-dd7380f0e14e","name":"issue13.js","type":2},{"id":"0b4b4794-1819-4e4a-089b-d8a73f9e2f72","name":"issue14.js","type":2},{"id":"bbc8af1c-c64b-4e67-790a-5b24a21788d3","name":"issue16.js","type":2},{"id":"222c8889-a3d6-baf0-4e56-94ba50cad98f","name":"issue17.js","type":2},{"id":"6eb6ecb7-4274-df0b-9b53-d95a2da76ecf","name":"issue20.js","type":2},{"id":"4403fc21-5004-61fb-9999-9cb1922254e2","name":"issue21.js","type":2},{"id":"79028cfb-50a0-452f-63d9-36e941c07c28","name":"issue25.js","type":2},{"id":"313280e2-2960-d0b5-5d95-8d201d17c9c8","name":"issue27.js","type":2},{"id":"4ce96254-b0d5-0e87-4d52-aa71878fcdb9","name":"issue28.js","type":2},{"id":"725e7900-4dd2-4315-13a9-e7d4c51f5f54","name":"issue29.js","type":2},{"id":"5621cdf3-492d-c369-0147-f854dfe56118","name":"issue30.js","type":2},{"id":"29249be1-2c99-aa4f-038c-a91564f40577","name":"issue34.js","type":2},{"id":"c42c70fa-7ad1-8361-3f29-e36877b622ec","name":"issue4.js","type":2},{"id":"9b4616d2-5c6b-3088-a68d-ffac3e5401c3","name":"issue48.js","type":2},{"id":"1ed280fe-b727-284b-447c-fe8958f1f0b2","name":"issue50.js","type":2},{"id":"f06cef6e-52a6-e0c2-310c-1c8d23f8e22e","name":"issue53.js","type":2},{"id":"e9555dc2-b4f5-41ac-a0a7-45ade349daf4","name":"issue54.1.js","type":2},{"id":"a4e990f5-3498-c11b-564b-1c0b12c88bc3","name":"issue68.js","type":2},{"id":"ee879885-f2fe-6003-ced2-c0cf86088142","name":"issue69.js","type":2},{"id":"a600665a-6501-8c9d-ce0e-cdc18b84b57b","name":"issue9.js","type":2},{"id":"b161d587-833b-66d4-2a01-3c36476c45f4","name":"mangle.js","type":2},{"id":"b9ff01d7-d4e1-0964-f77d-a223900d2ab0","name":"strict-equals.js","type":2},{"id":"dd79a211-2ac0-2307-e95b-51a65a5f73ef","name":"var.js","type":2},{"id":"fdebed3c-919f-79a4-db27-31050f508e14","name":"with.js","type":2}]},{"id":"21900ae2-c526-2738-b334-015693ba0fdc","name":"test","type":1,"children":[{"id":"120a3524-fffc-c63e-dd0a-c887a26ac01a","name":"array1.js","type":2},{"id":"bab1fae0-0255-f6dd-1564-8cf65eb7eb0b","name":"array2.js","type":2},{"id":"410b48a5-575e-95d0-2431-2ff5053c896a","name":"array3.js","type":2},{"id":"1c53ecf2-9ed8-bc67-b857-ea3643e3a3a4","name":"array4.js","type":2},{"id":"1011c58c-0a8d-b0ea-77c9-610b24d240f7","name":"assignment.js","type":2},{"id":"366863d6-5ca9-3644-859b-aef51ecacf7a","name":"concatstring.js","type":2},{"id":"86491638-d149-66c9-87d6-631691629862","name":"const.js","type":2},{"id":"16c23ec5-83d5-aa0e-c089-c1bcf641f583","name":"empty-blocks.js","type":2},{"id":"3fb259d4-b8ef-bf14-f3b4-e2584439722f","name":"forstatement.js","type":2},{"id":"49b2f4bf-e63b-c460-1d83-aebac3f28608","name":"if.js","type":2},{"id":"93f9d792-f4fa-6f4f-fcbb-5e4cb7c020d3","name":"ifreturn.js","type":2},{"id":"520d1004-91f4-dd53-622b-58b7aaf4d5a7","name":"ifreturn2.js","type":2},{"id":"914284d6-283c-4379-209c-c9f2a4699457","name":"issue10.js","type":2},{"id":"6335b68a-23fb-547e-0d53-05546c92c234","name":"issue11.js","type":2},{"id":"06c1bd87-2272-b0b0-87fe-bc5ca0ce0049","name":"issue13.js","type":2},{"id":"e6e70a51-232b-6d08-51d6-f31f02e6747c","name":"issue14.js","type":2},{"id":"59a3d6b6-c2e4-efaa-71ee-b319951c3141","name":"issue16.js","type":2},{"id":"80fdd44f-41fb-8675-d40c-716f89a68a25","name":"issue17.js","type":2},{"id":"533f912d-4ffb-d9c3-5f6f-2a7d50393c28","name":"issue20.js","type":2},{"id":"7c9c2833-d0a2-5e9d-be11-5c013063f604","name":"issue21.js","type":2},{"id":"ee926e17-9d51-b163-21d8-9317e1ddcbd6","name":"issue25.js","type":2},{"id":"bbd81b3d-ad32-f3b5-cb85-c00d914b36be","name":"issue27.js","type":2},{"id":"74d1c214-2ec8-5c3a-8da5-797c8f2fd9d6","name":"issue28.js","type":2},{"id":"04a38111-1412-f886-b266-78978a20d7c0","name":"issue29.js","type":2},{"id":"e95c8409-dc68-8aaf-c0eb-890803b202af","name":"issue30.js","type":2},{"id":"82ab3b03-9147-3b85-b0ec-d87a5f665a2b","name":"issue34.js","type":2},{"id":"86d4223e-5115-7935-7cdf-6aafd822ec5a","name":"issue4.js","type":2},{"id":"bf291285-d553-6c2a-79b7-b1d7ab93200f","name":"issue48.js","type":2},{"id":"490089f5-bb57-7c0d-6c7a-440f9b68538f","name":"issue50.js","type":2},{"id":"e44b27d0-0ba6-bab7-3f4c-c6f17821bafd","name":"issue53.js","type":2},{"id":"ca0efd79-0683-cbf1-7726-9669e1b33a8b","name":"issue54.1.js","type":2},{"id":"7daff8a5-3f0e-4759-b32b-1cd0087a026b","name":"issue68.js","type":2},{"id":"40b1ba24-bc77-007a-cdb6-1d56e993a5e7","name":"issue69.js","type":2},{"id":"0e0db11f-aaea-83eb-263f-1baab241f5a6","name":"issue9.js","type":2},{"id":"6be93f67-5be5-df14-9613-d4bc52f3d490","name":"mangle.js","type":2},{"id":"9c27935c-8880-b23a-0e7f-d6fa91dd8765","name":"strict-equals.js","type":2},{"id":"22cf0cbf-00f0-ee7e-48a1-9fbebb66b0cf","name":"var.js","type":2},{"id":"f7ffda8d-75c0-5dc7-0b7d-13d704fb1a93","name":"with.js","type":2}]}]},{"id":"6d07559f-b632-6cfa-04c7-6c56dd7619f0","name":"scripts.js","type":2}]}]},{"id":"5a4e8ef2-87a7-17c4-8946-1e02130952b8","name":"tmp","type":1,"children":[{"id":"72932975-a7b0-0f1e-64fd-c8038f3db988","name":"instrument.js","type":2},{"id":"b2a59880-007d-761f-3e95-30939d8dba61","name":"instrument2.js","type":2}]},{"id":"02539d81-9c50-2e40-f4ec-351ab12ceaa7","name":"uglify-js.js","type":2}]},{"id":"409b31c9-0d95-b035-6c1f-645c45533d75","name":"websocket-client","type":1,"children":[{"id":"40e74422-9414-40c2-58d0-f356fb4a58ea","name":"examples","type":1,"children":[{"id":"a2e92dc8-da85-6d69-ba94-035cb6824b22","name":"client-unix.js","type":2},{"id":"26545804-520b-0d8d-7801-9b2ed6aba04f","name":"client.js","type":2},{"id":"b0596920-9474-8c5b-a9cd-d8d1db1799c9","name":"server-unix.js","type":2}]},{"id":"af678e3a-d4c2-d956-6787-4e88eb57bae4","name":"lib","type":1,"children":[{"id":"b0812ca2-444e-f6c7-ac39-8e0618761aa5","name":"websocket.js","type":2}]},{"id":"891d7494-7db6-7f8d-2ecc-8ae3934f8a85","name":"LICENSE","type":2},{"id":"e4c7ffa8-fca1-db9f-008c-ed0f1827876e","name":"Makefile","type":2},{"id":"23e1ef7c-12c4-61d2-a8bc-8ad32d672770","name":"new","type":2},{"id":"43a1002a-282d-2556-0aca-df95775639ca","name":"old","type":2},{"id":"b39635f5-c0c4-d8ff-43af-ade64106c0db","name":"package.json","type":2},{"id":"81838ea6-a92a-3128-8e1d-6607045c3577","name":"README.md","type":2},{"id":"fcefdfb7-35bb-d6a1-254c-06961794f13d","name":"test","type":1,"children":[{"id":"ab88fce2-a815-de67-c7fd-87e44d79c414","name":"test-basic.js","type":2},{"id":"4533c53e-a130-8b6c-6308-993e3d81b0d9","name":"test-client-close.js","type":2},{"id":"9eaeef8c-044c-4525-01af-0a0f8e194f73","name":"test-readonly-attrs.js","type":2},{"id":"c380e9a8-1a41-f366-b920-6fc48531adbc","name":"test-ready-state.js","type":2},{"id":"2079dded-2cb2-55cd-5403-abeffa510d30","name":"test-server-close.js","type":2},{"id":"bedba9af-a18d-f512-a645-dbd0920c26a4","name":"test-unix-send-fd.js","type":2},{"id":"3d32781e-4d37-7c5b-a240-a7666b11a85d","name":"test-unix-sockets.js","type":2}]}]},{"id":"81a7383d-28b9-024f-09d3-2cc325a70127","name":"xmlhttprequest","type":1,"children":[{"id":"39703328-7855-58de-0dd3-935a196e897b","name":"autotest.watchr","type":2},{"id":"1b19b934-eaba-7d35-84ef-9806901f1ada","name":"demo.js","type":2},{"id":"e2cf2404-f516-fa00-af95-ff92cb743b76","name":"package.json","type":2},{"id":"92755e38-005d-0882-5935-0ced3cc3face","name":"README.md","type":2},{"id":"0feee60b-4613-9ccf-1f9b-16c810c245e0","name":"tests","type":1,"children":[{"id":"9415293a-0822-2351-2882-94cc15885794","name":"test-constants.js","type":2},{"id":"7255e77d-8bb6-7811-581a-677c2b2b76fe","name":"test-headers.js","type":2},{"id":"309747b4-d2e9-840f-5ebb-94d4dc9974a7","name":"test-request.js","type":2}]},{"id":"aba75b35-5bd0-a0ce-c1ac-3ba409f02f0a","name":"XMLHttpRequest.js","type":2}]}]},{"id":"d745cbbc-c698-0a45-5689-6818f7680b75","name":"package.json","type":2},{"id":"f1cd63a4-2eba-6c72-9a3e-e88203843804","name":"README.md","type":2},{"id":"68564410-0b7e-ad48-3b80-29f88a0693d4","name":"test","type":1,"children":[{"id":"b185bdc6-bf3d-2e0b-7ef3-81733bc1c079","name":"events.test.js","type":2},{"id":"1b107ba8-4c0e-d181-8442-cc327e22ea73","name":"io.test.js","type":2},{"id":"35c36de2-7f08-50b3-febb-3b73b8c84810","name":"node","type":1,"children":[{"id":"7c0c16ce-1282-e215-8c98-20f8970ad78a","name":"builder.common.js","type":2},{"id":"a8f4252d-1f91-7306-43cb-d153f5ea5eab","name":"builder.test.js","type":2}]},{"id":"e54d8be9-6867-fb5e-5483-4337efcdc30c","name":"parser.test.js","type":2},{"id":"b2be939d-197d-b83c-a0a0-0804d5657fe7","name":"socket.test.js","type":2},{"id":"29d0b1a6-d3b7-ca47-0ca5-372c37392a62","name":"util.test.js","type":2},{"id":"abef59c8-84bd-1a1e-a9ee-ec777ab7d735","name":"worker.js","type":2}]}]}]},{"id":"2362ae73-52e9-7d04-f86b-5a449821472a","name":"package.json","type":2},{"id":"c30aa767-b568-313d-902a-7a6ee5e5cb60","name":"Readme.md","type":2}]},{"id":"7d0a13d3-e370-060d-efd0-40c1f57b1970","name":"vows","type":1,"children":[{"id":"69226a62-7278-f65f-dd62-e261f5f38671","name":".npmignore","type":2},{"id":"6bcb9f58-9044-b54a-f749-e74d9c25c272","name":"bin","type":1,"children":[{"id":"39d30393-3601-0bec-2b2b-27ef0b89b698","name":"vows","type":2}]},{"id":"fe7ff657-feee-7e45-4fc7-1916b7c19c48","name":"lib","type":1,"children":[{"id":"41e995b7-25be-99f9-1492-7a70640c012d","name":"assert","type":1,"children":[{"id":"44a8f0ed-5e1f-a552-913e-d6c142f5f47e","name":"error.js","type":2},{"id":"35fade8c-7c47-cc20-653f-1c59c4aa873f","name":"macros.js","type":2},{"id":"4b0438b1-9524-c715-8e07-0e16a9c93ee0","name":"utils.js","type":2}]},{"id":"3a3c90bd-0e8f-2001-5999-d1ae6d500705","name":"vows","type":1,"children":[{"id":"d1260b5b-7d6d-e3e0-f2de-88e6cc463cde","name":"console.js","type":2},{"id":"93b48c31-4cea-e618-4490-1496d95c4f76","name":"context.js","type":2},{"id":"8aef71e0-9dda-090b-4cf7-f035483fb82a","name":"coverage","type":1,"children":[{"id":"3dc5d2ef-b0a8-24f6-847b-ebc10a8ae56d","name":"file.js","type":2},{"id":"012b7a95-c180-6f62-3465-c6cdcad888d6","name":"fragments","type":1,"children":[{"id":"dffc0b21-a322-4415-80c8-eeca0e502c74","name":"coverage-foot.html","type":2},{"id":"43a98a25-6997-a60a-4d3d-5920da10da27","name":"coverage-head.html","type":2}]},{"id":"c10c679d-b177-ffab-ac6e-696f64c3b538","name":"report-html.js","type":2},{"id":"751769e0-24b3-5120-d89b-d797d81458ef","name":"report-json.js","type":2},{"id":"9e96de91-9ef1-0a17-89e7-21e71627f7db","name":"report-plain.js","type":2}]},{"id":"5e66cc61-58da-d237-a005-e961d9641f0e","name":"extras.js","type":2},{"id":"0cc9469b-9950-c928-2c25-116b1d53a965","name":"reporters","type":1,"children":[{"id":"84eb74fc-c352-eb29-3d8e-321696bd1694","name":"dot-matrix.js","type":2},{"id":"7cbdc277-a7ce-ccac-8c48-bad972fa5de8","name":"json.js","type":2},{"id":"bb1ed28e-2110-1ff0-b954-316b768827ef","name":"silent.js","type":2},{"id":"443cccf5-b953-8b88-cd4a-a41ba030d9cf","name":"spec.js","type":2},{"id":"f208db02-6ca6-3824-e308-93dd5e976beb","name":"watch.js","type":2},{"id":"036f3428-17d3-64f5-c4f3-9cee0b6ad940","name":"xunit.js","type":2}]},{"id":"42977831-8913-eebd-70b3-a8f244370f1f","name":"suite.js","type":2}]},{"id":"1f632833-ec2a-3799-b628-1de7098f2cd7","name":"vows.js","type":2}]},{"id":"eeaf221e-5e3a-a556-e456-d2de21a56416","name":"LICENSE","type":2},{"id":"f3684aa1-5145-9f44-7236-56bc76030b1b","name":"Makefile","type":2},{"id":"fd01ea92-da34-7d98-1ad7-f5aae24cb6b1","name":"node_modules","type":1,"children":[{"id":"a418527f-5708-d382-d816-8d542a056aa1","name":"eyes","type":1,"children":[{"id":"c7dfe063-637e-bb54-7782-62830d0ef5f2","name":"lib","type":1,"children":[{"id":"807fc5b9-eb7d-3efc-1b29-976b9a4a8293","name":"eyes.js","type":2}]},{"id":"1395bf2e-2925-f1d0-303a-5e3426dd5ab6","name":"LICENSE","type":2},{"id":"801c7cd8-3198-09be-7700-2746ba4312bb","name":"Makefile","type":2},{"id":"17f40063-6ba8-ed3b-68d7-f18b3a6007e6","name":"package.json","type":2},{"id":"a2e44111-8793-1540-d58a-0a26eb7f3a0b","name":"README.md","type":2},{"id":"88894b1a-bac9-f66b-97a5-80533137e6ee","name":"test","type":1,"children":[{"id":"88875dca-d502-2100-09f2-b65e317c928b","name":"eyes-test.js","type":2}]}]}]},{"id":"483e2124-931d-2e8c-a640-751765b014a8","name":"package.json","type":2},{"id":"a008196a-a509-dc0d-fedf-a17b2bb26705","name":"README.md","type":2},{"id":"3813a0ee-0ee6-adde-9e0f-d52fbef83ece","name":"test","type":1,"children":[{"id":"ff9c6fa2-2423-738a-d760-c57543788828","name":"assert-test.js","type":2},{"id":"59fde273-a09b-aee3-c21b-eb3d182ad9f9","name":"fixtures","type":1,"children":[{"id":"a5b571fa-6217-ee95-f120-d7ac3cf6cb10","name":"isolate","type":1,"children":[{"id":"dbeef9aa-9c23-f16f-eb4f-ad4420b2e617","name":"failing.js","type":2},{"id":"7f9efdaa-3bf0-5d4f-a996-7c0a85b89102","name":"log.js","type":2},{"id":"015c5a27-ddd9-2c4c-7a0c-82979330d1a0","name":"passing.js","type":2},{"id":"72605038-a96d-6314-e850-981cce287be3","name":"stderr.js","type":2}]},{"id":"095cd92f-07ac-bb38-59c2-241e0ebac97a","name":"supress-stdout","type":1,"children":[{"id":"4da7bba3-1f1f-2d01-86ed-d898107780aa","name":"output.js","type":2}]}]},{"id":"a6b8134d-8070-0a48-12f2-adf597a6d731","name":"isolate-test.js","type":2},{"id":"7f2e9535-747b-889d-2aae-e192423b56bf","name":"supress-stdout-test.js","type":2},{"id":"c1dd41cb-6cb0-fae7-bc8b-112cfc18d14b","name":"testInherit.js","type":2},{"id":"71593103-09d5-6f4e-6d9b-401658ee6888","name":"vows-error-test.js","type":2},{"id":"f6cbc200-6635-3f7d-58f3-c717be746cdc","name":"vows-test.js","type":2}]}]}]},{"id":"14c79fff-f045-8e15-5a1d-1dc9928948ed","name":"package.json","type":2},{"id":"c8c0047d-c033-27bd-c73a-72ff495adce2","name":"server.js","type":2},{"id":"ba43455e-2adc-54b6-9aa0-1157e4438118","name":"static","type":1,"children":[{"id":"343a635d-51a4-58b3-6525-15896df99231","name":"css","type":1,"children":[{"id":"ac14fd48-8a1f-91af-9e88-18ef2379ad94","name":"style.css","type":2}]},{"id":"01c0798b-6d03-f95b-f32e-5a1fc8bcc811","name":"images","type":1,"children":[]},{"id":"d9b8c8f9-234e-529e-3746-78bc596c5e5e","name":"js","type":1,"children":[{"id":"1dca7bb2-e113-f5dd-9948-8fa088379deb","name":"script.js","type":2}]}]},{"id":"9d59e7e7-6d41-854e-e6b5-a98837f33897","name":"test","type":1,"children":[{"id":"f6c0a376-0370-9cde-e27b-b8c0f43bcc1b","name":"stub.js","type":2}]},{"id":"33a3c924-39ab-a8c0-d8d9-6f0f2e7a49d1","name":"tmp","type":1,"children":[{"id":"3f3dc02b-5c7b-b21f-33a1-6ed76ede9ce2","name":"file_path","type":2},{"id":"d063b291-52ab-585f-a062-d95270f46963","name":"stringifyfolder.txt","type":2}]},{"id":"6ce079f6-7241-21cb-f366-9789f83e645e","name":"views","type":1,"children":[{"id":"b3c5dfb9-d3c9-5f07-4d1c-dc486b8ed8db","name":"404.jade","type":2},{"id":"5dff7cf5-3e11-8825-34cc-f6f751768aba","name":"500.jade","type":2},{"id":"99823e59-6ddb-d524-c40f-d09b966cb344","name":"index.jade","type":2},{"id":"ae6ad4ee-5c87-938c-a366-8390419746b0","name":"layout.jade","type":2}]}]};