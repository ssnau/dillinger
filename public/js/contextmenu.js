/**
 * Created with JetBrains WebStorm.
 * User: Administrator
 * Date: 3/7/13
 * Time: 10:20 PM
 * To change this template use File | Settings | File Templates.
 */
contextmenu = (function(){
    var style = "position:fixed;z-index:999;"
    var rt = [
        '<div class="contextmenu" style="', style ,'">',
            '<ul>${content}</ul>',
        '</div>'
    ].join('\n'),
        et = ["<li class='item cmitem' cmd='${cmd}' m='${manager}'><span>${text}</span></li>"].join('\n'),
        managers = {};

    document.addEventListener('click', function(e) {
       var t = e.target || e.source;
       if (t.tagName.toLowerCase() == 'span') t = t.parentNode;
       var cmd = t.getAttribute('cmd'),
           m = t.getAttribute('m');

        if (t.tagName.toLowerCase() === 'li' && /\scmitem$/.test(t.className)) {
            // ask the manager to do that
            if (m && managers[m]) {
                managers[m].exec[cmd](e);
            }
        }
    });

    $(document).click(function(){
        clearCM();
    })

    function clearCM() {
        $('.contextmenu').remove();
    }

    function build(e, cm) {
        var html = '',
            items = cm.getItems(e);

        $('.contextmenu').remove();
        if (!items.length) return;
        $.each(items, function(inx, item) {
            html += getFromTemplate(et, {
                'cmd': item['cmd'],
                'manager': cm.name,
                'text': item['text']
            });
        });
        html = getFromTemplate(rt, {'content': html});
        var x = e.clientX,
            y = e.clientY,
            node = $(html);

        node.css('left', x + 'px').css('top', y + 'px').css('display', 'none');
        $(document.body).append(node);
        node.fadeIn(300)
    }

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

    return {
        /**
         * register DomNode with context menu.
         * @param pNode HTMLElement Or String
         * @param cNode String indicating which node we should bind on
         * @param cm ContextMenuManager {name|getItems()}
         */
        register: function(pNode, cNode, cm) {
            if (Object.prototype.toString.call(cNode) !== '[object String]') {
                cm = cNode;//this is not a delegate
                $(pNode).contextmenu(popup)
            } else {
                $(pNode).on(cNode, 'contextmenu',popup)
            }
            managers[cm.name] = cm;
            function popup(e) {
                e.preventDefault();
                // if the manager has confirm method, we should ask for confirm first.
                if (cm.confirm) {
                    cm.confirm(e) && build(e, cm);
                }
            }
        },
        /* a helper function used for clear existing contextmenu*/
        clearCM: clearCM
    }

})();
/**
 * a context menu manger(short for cmm) should have such fields. '*' means it is required.
 * {
 * name, {String}* name
 * getItems, {Array Function}* get menu items under current condition
 * exec, {JSON}* containing we execute the action by calling cmm.exec[cmd](e); Using Json is to make it easier to mixin with other cmd Object when they perform the same action but in diffirent cmm
 * confirm, {Bool Function} if it return false, we shouldn't display the menu; if it doesn't exist, we always show the menu without check
 *}
 */