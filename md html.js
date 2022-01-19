// Cache selectors
var lastId,
    topMenu = $("nav"),
    topMenuHeight = topMenu.outerHeight() + 1,
    // All list items
    menuItems = topMenu.prevObject.find("a"),
    // Anchors corresponding to menu items
    scrollItems = menuItems.map(function () {
        var item = $($(this).attr("href"));
        var $this = $(this); // caching $(this)
        $this.data('defaultText', $this.text());
        $this.data('hover', $this.text());
        if (item.length) { return item; }
    });
console.log(menuItems);

var headingHeight = $("h1").outerHeight() + 1;

function toggleTransitionWithTimeout(i, text) {
    i.addClass("unfade"); // removing the class
    setTimeout(() => {
        requestAnimationFrame(() => {
            // We are manually adding new content and adding class again to node
            i.html(text);
            i.removeClass("unfade");

        });
    }, 200); // timeout
}

// Fading on larger screens
function fader() {
    console.log("fader");
    if (window.matchMedia('(min-width: 900px)').matches) {
        topMenu.css("display",'block');
        topMenu.css('width',topMenu.outerWidth());
        topMenu.css("display",'');
        $('#toc').css('text-decoration','');
        menuItems.parent().hover(
            function () {
                var $this = $(this)[0]; // caching $(this)
                var $that = $($this.children[0]);
                $that.html($that.data('defaultText'));

            },
            function () {
                var $this = $(this)[0]; // caching $(this)
                var $that = $($this.children[0]);
                toggleTransitionWithTimeout($that, $that.data('hover'));
            }
        );
    } else {
        topMenu.css('width','');
        menuItems.parent().hover(null, null);
    };
}
fader()
$(window).resize(fader);

// TOC

var toc = $('#toc')
toc.click(function () {
    if (topMenu.css("display") == "none") {
        topMenu.css("display", "block");
        toc.css("text-decoration", "underline");
    } else {
        topMenu.css("display", "none");
        toc.css("text-decoration", "none");
    }
});

var off = false;

// Bind to scroll
$(window).scroll(function () {
    // Get container scroll position
    var fromTop = $(this).scrollTop() + 2 * headingHeight;

    // Get id of current scroll item
    var cur = scrollItems.map(function () {
        if ($(this).offset().top < fromTop)
            return this;
    });
    // Get the id of the current element
    cur = cur[cur.length - 1];
    var id = cur && cur.length ? cur[0].id : "";
    var idx = menuItems.filter("[href='#" + id + "']")

    if (lastId !== id) {
        lastId = id;
        // Set/remove active class
        menuItems
            .parent().removeClass("active");
        menuItems.css("color","");
        menuItems
            .filter("[href='#" + id + "']").parent().addClass("active");

        var ggparent = menuItems
            .filter("[href='#" + id + "']").parent().parent().parent()
        if (ggparent[0] && ggparent[0].localName == "li") {
            ggparent.addClass("active");
            //ggparent.eq(0).children().eq(0).css("color","#57A64A")

        } else if (ggparent.eq(0).localName = "nav") {
         //   menuItems
         //       .filter("[href='#" + id + "']").css("color","#57A64A")
        };
    }

    if ((window.matchMedia('(min-width: 900px)').matches)) {
        if (fromTop < 200 && off) {
            off = false;
            menuItems.each(function () {
                var $this = $(this); // caching $(this)
                $this.data('hover', $this.data("defaultText"));
                toggleTransitionWithTimeout($this, $this.data('defaultText'));
            })
            console.log("on")
        } else if (fromTop > 200 && !off) {
            off = true;
            menuItems.each(function () {
                var $this = $(this); // caching $(this)
                $this.data('hover', "&nbsp;");
                toggleTransitionWithTimeout($this, $this.data('hover'));
            })
            console.log("off")
        }
    } else if (off) {
        off = false;
        menuItems.each(function () {
            var $this = $(this); // caching $(this)
            $this.data('hover', $this.data("defaultText"));
            toggleTransitionWithTimeout($this, $this.data('defaultText'));
        })
    }
});



// Theme
var btn = $('#theme'),
    body = $('body');

btn.click(function () {
    if (btn.text() == "Light") {
        body.removeClass("vscode-light");
        body.addClass("vscode-dark");
        toggleTransitionWithTimeout(btn, "Dark");
    } else if (btn.text() == "Dark") {
        body.removeClass("vscode-dark");
        body.addClass("vscode-light");
        toggleTransitionWithTimeout(btn, "Light");
    }
});