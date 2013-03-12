/**
 * Created with JetBrains WebStorm.
 * User: ssnau
 * Date: 3/11/13
 * Time: 11:46 PM
 */
imagepalette = (function(){
    var markup = [
        '<div id="image-processor-modal" class="modal hide fade" tabindex="-1" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true">',
            '<div class="modal-header">',
                '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>',
                '<h3 id="myModalLabel">Image Palette</h3>',
            '</div>',
            '<div class="modal-body">',
                '<div class="pasteCatcher" contenteditable="contenteditable" ></div>',
                '<p><span>press Ctrl + V to paste</span></p>',
                '<div class="image-holder" style="height:300px;overflow:scroll"></div>',
                '<form class="form-horizontal" style="margin-bottom:0px;">',
                    '<div class="control-group" style="margin-bottom:0px;">',
                        '<label class="control-label" style="width:auto;" for="imageURL">Image URL:</label>',
                        '<div class="controls" style="margin-left:80px">',
                            '<input type="text" class="span4 extra-info" id="imageURL" placeholder="Paste The Image Above, You Will See The URL Here">',
                        '</div>',
                    '</div>',
                '</form>',
            '</div>',
            '<div class="modal-footer">',
                '<button class="btn close" data-dismiss="modal" aria-hidden="true">Close</button>',
           '</div>',
        '</div>'
    ].join("\n");

    // when file is loaded, we call this function to do the rest thing by set the binary as param for it
    // and this function must return String so that image palette know what to display on the information panel.
    var callback = function(){}; //TODO: we should be more gentle.
    /* Handle paste events */
    function pasteHandler(e) {
        // We need to check if event.clipboardData is supported (Chrome)
        if (e.clipboardData) {
            // Get the items from the clipboard
            var items = e.clipboardData.items;
            if (items) {
                // Loop through all items, looking for any kind of image
                for (var i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        // We need to represent the image as a file,
                        var blob = items[i].getAsFile();
                        // and use a URL or webkitURL (whichever is available to the browser)
                        // to create a temporary URL to the object
                        var URLObj = window.URL || window.webkitURL;
                        var source = URLObj.createObjectURL(blob);
                        var reader = new FileReader();
                        reader.onload = function(e) {
                            console.log('Sending file...');
                            //get all content
                            var buffer = e.target.result;

                            callback(buffer, function(info){
                                var $info = $(".extra-info");
                                $info.attr("value", info);
                            });


                            //send the content via socket
                            //socket.emit('send-file', file.name, buffer);
                            console.log('send-file', file.name, buffer);
                        }
                        reader.readAsBinaryString(blob);

                        // The URL can then be used as the source of an image
                        createImage(source);
                    }
                }
            }
            // If we can't handle clipboard data directly (Firefox),
            // we need to read what was pasted from the contenteditable element
        } else {
            // This is a cheap trick to make sure we read the data
            // AFTER it has been inserted.
            setTimeout(checkInput, 1);
        }
    }

    /* Parse the input in the paste catcher element */
    function checkInput() {
        // Store the pasted content in a variable
        var pasteCatcher = $('.image-holder')[0];
        var child = pasteCatcher.childNodes[0];

        // Clear the inner html to make sure we're always
        // getting the latest inserted content
        pasteCatcher.innerHTML = "";

        if (child) {
            // If the user pastes an image, the src attribute
            // will represent the image as a base64 encoded string.
            if (child.tagName === "IMG") {
                createImage(child.src);
            }
        }
    }

    /* Creates a new image from a given source */
    function createImage(source) {
        var pastedImage = new Image(),
            holder = $("#image-processor-modal .image-holder");
        pastedImage.onload = function() {
            // You now have the image!
        };
        pastedImage.src = source;
        holder.html('');
        $(pastedImage).appendTo(holder);
    }

    function init() {
        var $modal = $(markup);
        $modal.appendTo(document.body);

        // We start by checking if the browser supports the
        // Clipboard object. If not, we need to create a
        // contenteditable element that catches all pasted data
        if (!window.Clipboard) {
            // as long as we make sure it is always in focus
            var pc = $(".pasteCatcher")
            pc.focus();
            $modal.find('.modal-body').click(function(){pc.focus();});
        }
        // Add the paste event listener
        window.addEventListener("paste", pasteHandler);
        $modal.find(".close").click(function(){
            close();
        })
    }

    function reinit() {
        window.addEventListener("paste", pasteHandler);
    }

    function close(){
        window.removeEventListener("paste", pasteHandler);
    }

    var imagepalette = {
        popup: function(count){
            if (!count) count = 5;
            if (count == 1) {console.log("i dont know why it cannot popup, i'v tried 5 times"); return}
            var modal = document.getElementById('image-processor-modal');
            if (modal) {
                $(modal).modal('show');
                reinit();
            } else {
                init();
                this.popup(count);
            }
        },
        register: function(f) {
            callback = f;
        }
    }

    return imagepalette;
})();
