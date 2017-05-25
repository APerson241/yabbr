document.addEventListener( "DOMContentLoaded", function() {
    var globals = {
        "currentCat": "",
        "currentPage": "",
        "iterator": "",
        "editToken": "",
        "pendingEdits": 0
    };

    // Event listeners

    function updateSubmitTokenDisabled() {
        document.getElementById( "submit-token" ).disabled = !document.getElementById( "edit-token" ).value;
    }

    document.getElementById( "edit-token" ).addEventListener( "keyup", updateSubmitTokenDisabled );
    document.getElementById( "edit-token" ).addEventListener( "keydown", updateSubmitTokenDisabled );

    document.getElementById( "submit-token" ).addEventListener( "click", function () {
        document.getElementById( "edit-token" ).disabled = true;
        this.disabled = true;
        globals.editToken = document.getElementById( "edit-token" ).value.replace( /\\\\$/, "\\" );
        document.getElementById( "edit-token-status" ).innerHTML = "Token saved!";
        document.getElementById( "save-page" ).disabled = false;
        document.getElementById( "login-panel" ).removeChild( document.querySelector( "#login-panel .warningbox" ) );
        document.getElementById( "login-panel" ).removeChild( document.querySelector( "#login-panel br" ) );
    } );

    document.querySelector( "#select-backlog select" ).addEventListener( "change", function () {
        if( !this.value.startsWith( "Category:" ) ) {
            document.getElementById( "backlog-size" ).innerHTML = "";
            return;
        }

        // Load and display backlog size
        globals.currentCat = this.value;
        updateCategorySize();

        // Load first page
        globals.iterator = new CategoryIterator( globals.currentCat );
        nextPage();
    } );

    document.getElementById( "skip-page" ).addEventListener( "click", function () {
        this.disabled = true;
        updateCategorySize();
        nextPage();
    } );

    function nextPage() {
        globals.iterator.next().then( function ( nextPage ) {
            globals.currentPage = nextPage;
            var pageNameElement = document.getElementById( "current-page-name" )
            pageNameElement.innerHTML = "";
            pageNameElement.appendChild( makeWikilink( globals.currentPage ) );
            apiFunctions.getPageText( globals.currentPage ).then( function ( pageText ) {
                loadDupeRefNamesView( pageText );
                document.getElementById( "skip-page" ).disabled = false;
            } );
        } );
    }

    function updateCategorySize() {
        apiFunctions.getCategorySize( globals.currentCat ).then( function ( count ) {
            var backlogSize = document.getElementById( "backlog-size" );
            backlogSize.innerHTML = "(Size: ";
            backlogSize.appendChild( makeWikilink( globals.currentCat, count.toLocaleString() + " pages" ) );
            backlogSize.innerHTML += ")";
        } );
    }

    function loadDupeRefNamesView( pageText ) {
        var refElementRe = /<ref[\s\S]*?(?:<\/ref>|\/>)/g;
        var refMatch;
        var OPEN_TAG = new RegExp( "^<ref\\s+name\\s*=\\s*(?:\"|\')?([^>\\/\\\\\"\']+)(?:\"|\')?\\s*(\\/?)>" );
        var CONTEXT_LENGTH = 100;
        var refs = [];
        while( refMatch = refElementRe.exec( pageText ) ) {
            var refMatchText = refMatch[0];
            var refMatchStart = refMatch.index;
            var refMatchEnd = refMatch.index + refMatchText.length;
            var match = OPEN_TAG.exec( refMatchText );
            if( match && match[1] && match[1].trim().length ) {
                refs.push( {
                    "ref": refMatchText,
                    "name": match[1].trim(),
                    "selfclosing": !!match[2],
                    "context": [
                        pageText.substring( Math.max( 0, refMatchStart - CONTEXT_LENGTH ), refMatchStart ),
                        pageText.substring( refMatchEnd, Math.min( refMatchEnd + CONTEXT_LENGTH, pageText.length - 1 ) )
                    ]
                } );
            }
        }

        var refNameTallies = {};
        refs.forEach( function ( refObject ) {
            if( refObject.name && !refObject.selfclosing ) {
                refNameTallies[ refObject.name ] = ( refNameTallies[ refObject.name ] || 0 ) + 1;
            }
        } );
        var dupeRefs = {};
        refs.forEach( function ( refObject ) {
            if( refNameTallies[refObject.name] > 1 ) {
                dupeRefs[ refObject.name ] = ( dupeRefs[ refObject.name ] || [] ).concat( refObject );
            }
        } );

        if( Object.keys( dupeRefs ).length === 0 ) {
            document.getElementById( "edit-panel" ).innerHTML = "<div class='error'>The duplicate reference problem on this page isn't fixable! Possible causes: <ul><li>The parser couldn't find the duplicate references</li><li>One of the duplicate references is inside a template, so we can't modify it</li></ul></div>";
            return;
        }

        // Flag references with duplicated texts, not just names
        var matchTexts = [];
        var hasDuplicateMatchText = matchTexts.indexOf( refMatchText ) !== -1;
        if( !hasDuplicateMatchText ) {
            matchTexts.push( refMatchText );
        }

        document.getElementById( "edit-panel" ).innerHTML = "";
        var listElement = document.createElement( "ul" );

        function makeRefListItemHtml ( refname, refnum, firstTextarea ) {
            return "<span class='vertical-align'><textarea class='mw-ui-input" +
                ( firstTextarea ? "" : " has-button" ) + "' data-refname='" +
                refname + "' data-refnum='" + refnum + "'>" +
                escapeHtml( dupeRefs[refname][refnum].ref ) + "</textarea>";
        }
        Object.keys( dupeRefs ).forEach( function ( dupeRefName ) {
            var newInnerElement = document.createElement( "li" );
            var newInnerElementHtml = "";
            newInnerElementHtml += "<span class='ref-name'>" + dupeRefName +
                "</span> <span class='ref-count'>(" + dupeRefs[dupeRefName].length +
                " total references)</span><ul>";
            var ourDupeRefs = dupeRefs[dupeRefName];
            var firstTextarea = true;
            var allMatchTexts = [];
            for( var i = 0; i < ourDupeRefs.length; i++ ) {
                if( ourDupeRefs[i].selfclosing ) {

                    // Count the # of selfclosing refs after this
                    for( var j = i; j < ourDupeRefs.length; j++ ) {
                        if( !ourDupeRefs[j].selfclosing ) break;
                    }

                    newInnerElementHtml += "<li>(" + ( j - i ) +
                        " self-closing reference" + ( ( j - i === 1 ) ? "" : "s" ) +
                        " - <a class='display-self-closing' href='#'>show</a>)</li>";
                    i = j - 1;
                } else {
                    newInnerElementHtml += "<li>";
                    newInnerElementHtml += makeRefListItemHtml( dupeRefName, i, firstTextarea );

                    if( firstTextarea ) {
                        firstTextarea = false;

                        // We always need to check subsequent full texts against the first one
                        allMatchTexts.push( ourDupeRefs[i].ref );
                    } else {
                        newInnerElementHtml += "<div class='self-closing-container'>";
                        var spacelessRef = ourDupeRefs[i].ref.replace( /\s/g, "" );
                        var isDuplicate = allMatchTexts.indexOf( spacelessRef ) !== -1;
                        newInnerElementHtml += "<button class='mw-ui-button " +
                            ( isDuplicate ? "mw-ui-progressive " : "" ) + "make-self-closing'>" +
                            "Self-close</button>";
                        if( isDuplicate ) {
                            newInnerElementHtml += "<br /><span class='duplicate-notice'>Duplicated!</span>";
                        } else {
                            allMatchTexts.push( spacelessRef );
                        }
                        newInnerElementHtml += "</div>";
                    }
                    newInnerElementHtml += "</span></li>";
                }
            }
            newInnerElementHtml += "</ul>";
            newInnerElement.innerHTML = newInnerElementHtml;
            listElement.appendChild( newInnerElement );
        } );
        document.getElementById( "edit-panel" ).appendChild( listElement );

        var displaySelfClosing = document.getElementsByClassName( "display-self-closing" );
        for( var i = 0; i < displaySelfClosing.length; i++ ) {
            displaySelfClosing[i].addEventListener( "click", function ( event ) {
                var listItem = event.target.parentNode;
                var startingRefnum = 0;
                var endingRefnum = 0;

                if( listItem.previousSibling ) {
                    var prevTextarea = listItem.previousSibling.childNodes[0].childNodes[0];
                    var startingRefnum = parseInt( prevTextarea.getAttribute( "data-refnum" ) ) + 1;
                    var refname = prevTextarea.getAttribute( "data-refname" );
                }

                if( listItem.nextSibling ) {
                    var nextTextarea = listItem.nextSibling.childNodes[0].childNodes[0];
                    var endingRefnum = parseInt( nextTextarea.getAttribute( "data-refnum" ) ) - 1;
                    var refname = nextTextarea.getAttribute( "data-refname" );
                }

                if( !refname ) {
                    console.log("...no refname, sorry");
                    event.target.disabled = true;
                    event.preventDefault();
                    return;
                }
                var endingRefnum = ( endingRefnum === 0 ) ? dupeRefs[refname].length - 1 : endingRefnum;

                var textareas = document.createDocumentFragment();
                for( var j = startingRefnum; j <= endingRefnum; j++ ) {
                    var currListItem = document.createElement( "li" );
                    currListItem.innerHTML = makeRefListItemHtml( refname, j, false );
                    textareas.appendChild( currListItem );
                }
                listItem.innerHTML = "";
                listItem.appendChild( textareas );

                // Definition at the end of loadDupeRefNamesView
                updateTextAreasStyleAndListeners();

                event.preventDefault();
            }.bind( this ) );
        }

        var selfClosingButtons = document.getElementsByClassName( "make-self-closing" );
        for( var i = 0; i < selfClosingButtons.length; i++ ) {
            selfClosingButtons[i].addEventListener( "click", function ( event ) {
                var textArea = event.target.parentElement.previousSibling;
                textArea.value = "<ref name=\"" + textArea.dataset.refname + "\" />";
                document.getElementById( "save-page" ).disabled = false;
                event.target.disabled = true;
            }.bind( this ) );
        }

        var savePageButton = document.getElementById( "save-page" );
        savePageButton.disabled = true;

        // Clear event listeners, from http://stackoverflow.com/a/19470348/1757964
        savePageButton.parentNode.replaceChild( savePageButton.cloneNode( /* deep */ true ), savePageButton );
        var savePageButton = document.getElementById( "save-page" );

        savePageButton.addEventListener( "click", function () {
            savePageButton.disabled = true;
            savePageButton.innerHTML = "Saving...";
            apiFunctions.getPageText( globals.currentPage ).then( function ( pageText ) {

                // Apply each textarea's change to the text of the page
                document.querySelectorAll( "#edit-panel textarea" ).forEach( function ( textArea ) {
                    var refName = textArea.dataset.refname;
                    var refNum = textArea.dataset.refnum;
                    var ref = dupeRefs[refName][refNum];

                    // Get the original text of this ref in the page text
                    var originalRef = ref.ref;

                    // Add context, so if two refs are exactly the same we get the right one
                    var originalText = ref.context[0] + originalRef + ref.context[1];
                    var newText = ref.context[0] + textArea.value + ref.context[1];

                    pageText = pageText.replace( originalText, newText );
                } );

                var saveIndicator = document.getElementById( "save-indicator" );
                globals.pendingEdits++;
                saveIndicator.textContent = globals.pendingEdits;
                saveIndicator.className = "active";

                var editProgressElement = document.createElement( "span" );
                editProgressElement.className = "edit-progress pending";
                editProgressElement.textContent = "Saving " + globals.currentPage + "...";
                var editProgressContainer = document.getElementById( "save-results" );
                editProgressContainer.insertBefore( editProgressElement, editProgressContainer.firstChild );

                nextPage();
                savePageButton.innerHTML = "Save page";

                // Save our changes to the page text
                apiFunctions.savePage( globals.currentPage, pageText,
                                       globals.editToken, "Fixing duplicate references with YABBR" )
                    .then( function ( response ) {
                        try {
                            response = JSON.parse( response );
                            var articleTitle = response["edit"]["title"];
                            var result = response["edit"]["result"];
                            editProgressElement.innerHTML = "Edit to <a href='https://en.wikipedia.org/wiki/" + encodeURIComponent( articleTitle ) + "'>" + articleTitle + "</a> &rarr; " + result + "</span>";
                            if( response["edit"]["result"] === "Success" ) {
                                editProgressElement.innerHTML += " (<a href='https://en.wikipedia.org/w/index.php?title=" + articleTitle + "&diff=prev&oldid=" + response["edit"]["newrevid"] + "'>diff</a>)";
                                editProgressElement.className = "edit-progress success";
                            } else {
                                editProgressElement.className = "edit-progress failure";
                            }
                            globals.pendingEdits--;
                            saveIndicator.textContent = globals.pendingEdits;
                            saveIndicator.className = ( globals.pendingEdits > 0 ) ? "active" : "";
                        } catch ( e ) {
                            saveResult.innerHTML = "Error parsing server response";
                            console.log(e);
                        }

                        setTimeout( updateCategorySize, 500 );
                        setTimeout( updateCategorySize, 1500 );
                    } )
            }.bind( this ) );
        }.bind( this ) );

        function enableSavePageButton () { document.getElementById( "save-page" ).disabled = false; }

        // Make the text areas taller and give them text listeners
        function updateTextAreasStyleAndListeners() {
            document.querySelectorAll( "#edit-panel textarea" ).forEach( function ( textArea ) {
                textArea.style.height = textArea.scrollHeight + "px";
                textArea.addEventListener( "input", function () {
                    document.getElementById( "save-page" ).disabled = false;//!globals.editToken;
                } );
            } );
        }
        updateTextAreasStyleAndListeners();
    }

    var apiFunctions = {
        getCategorySize: function ( categoryName ) {
            return new Promise( function ( resolve, reject ) {
                makeApiCall( {
                    "action": "query",
                    "prop": "categoryinfo",
                    "titles": categoryName
                } ).then( function ( data ) {
                    try {
                        var pageId = Object.keys( data.query.pages )[0];
                        resolve( data.query.pages[ pageId ].categoryinfo.size );
                    } catch( e ) {
                        reject();
                    }
                } );
            } );
        },
        getPageText: function ( pageName ) {
            return new Promise( function ( resolve, reject ) {
                makeApiCall( {
                    "action": "query",
                    "prop": "revisions",
                    "titles": pageName,
                    "rvprop": "content",
                } ).then( function ( data ) {
                    try {
                        var pageId = Object.keys( data.query.pages )[0];
                        resolve( data.query.pages[ pageId ].revisions[0]["*"] );
                    } catch( e ) {
                        reject();
                    }
                } );
            } );
        },
        getToken: function () {
            return new Promise( function ( resolve, reject ) {
                try{
                makeApiCall( {
                    "action": "query",
                    "meta": "tokens"
                } ).then( function ( data ) {
                    console.log(data);
                    try {
                        resolve( data.query.tokens.csrftoken );
                    } catch ( e ) {
                        reject();
                    }
                } );
                }catch(e){console.log(e);}
            } );
        },
        savePage: function ( pageName, newText, token, editSummary ) {
            return new Promise( function ( resolve, reject ) {
                var xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function() {
                    if ( xhr.readyState == XMLHttpRequest.DONE ) {
                        resolve(xhr.response);
                    }
                };
                xhr.open( 'POST', 'http://localhost:8000/cgi-bin/relay.py', true );
                xhr.setRequestHeader( "Content-Type","application/x-www-form-urlencoded" );
                var params = "token=" + encodeURIComponent( globals.editToken ) + "&text=" +
                    encodeURIComponent( newText ) + "&title=" +
                    encodeURIComponent( pageName ) + "&summary=" + editSummary;
                try{
                    xhr.send( params );
                } catch( e ) {
                    console.log(e);
                    reject(e);
                }
            } );
        },

        // OAuth stuff
        doAuthorizationRedirectOld: function () {
            var CONSUMER_TOKEN = "a38bdea381b2d3cb27c54c9224de4013";
            var SECRET_TOKEN = "93e2426dda047c6ff646dd7d0897be3101d7522e";

            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if ( xhr.readyState == XMLHttpRequest.DONE ) {
                    console.log(xhr.response);
                }
            };
            xhr.open( "GET", "https://meta.wikimedia.org/w/index.php?title=Special:OAuth/initiate" );
            var params = {
                "oauth_calllback": "oob",
                "oauth_consumer_key": CONSUMER_TOKEN,
                "oauth_version": "1.0"
            };
            params = Object.keys( params ).map( function ( key ) {
                return encodeURIComponent( key ) + "=" +
                    encodeURIComponent( params[key] );
            } ).join( "&" );
            xhr.send( params );
        },
        doAuthorizationRedirect: function () {
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if ( xhr.readyState == XMLHttpRequest.DONE ) {
                    console.log(xhr.response);
                }
            };
            xhr.open( 'GET', 'http://localhost:8000/cgi-bin/oauth.py', true );
            xhr.setRequestHeader( "Content-Type","application/x-www-form-urlencoded" );
            var params = "";
            try{
                xhr.send( params );
            } catch( e ) {
                console.log(e);
                reject(e);
            }
        },
    };

    // Doesn't meet the Iterator protocol 'cause we need it async, because
    // sometimes we need to make an API call in next()
    function CategoryIterator( name ) {
        this.name = name;
        this.index = 0;
        this.rawMembers = [];

        this.next = function () {
            return new Promise( function ( resolve, reject ) {
                if( this.index < this.rawMembers.length ) {
                    resolve( this.rawMembers[ this.index++ ].title );
                } else {
                    makeApiCall( {
                        "action": "query",
                        "list": "categorymembers",
                        "cmtitle": this.name,
                        "cmprop": "title|sortkey",
                        "cmstarthexsortkey": this.rawMembers.length ? this.rawMembers[this.rawMembers.length - 1].sortkey : ""
                    } ).then( function ( data ) {
                        try {
                            this.rawMembers = data.query.categorymembers;
                            this.index = 1;
                            if( this.rawMembers.length ) {
                                resolve( this.rawMembers[ this.index++ ].title );
                            } else {
                                reject( "No members returned from API" );
                            }
                        } catch ( e ) {
                            reject( e );
                        }
                    }.bind( this ) );
                }
            }.bind( this ) );
        };
    }

    function makeWikilink( pageName, linkLabel ) {
        linkLabel = linkLabel || pageName;
        var link = document.createElement( "a" );
        link.href = "https://en.wikipedia.org/wiki/" + pageName;
        link.appendChild( document.createTextNode( linkLabel ) );
        link.title = pageName + " on the English Wikipedia";
        return link;
    }

    const API_ROOT = "https://en.wikipedia.org/w/api.php",
          API_SUFFIX = "&format=json&callback=?&continue=";
    function makeApiUrl( params ) {
        var paramString = Object.keys( params ).map( function ( key ) {
            return encodeURIComponent( key ) + "=" + encodeURIComponent( params[key] );
        } ).join( "&" );
        return API_ROOT + "?" + paramString + API_SUFFIX;
    }

    function makeApiCall( params ) {
        return loadJsonp( makeApiUrl( params ) );
    }

    // Adapted from https://gist.github.com/gf3/132080/110d1b68d7328d7bfe7e36617f7df85679a08968
    var jsonpUnique = 0;
    function loadJsonp(url) {
        var unique = jsonpUnique++;
        return new Promise( function ( resolve, reject ) {
            var name = "_jsonp_" + unique;
            if (url.match(/\?/)) url += "&callback="+name;
            else url += "?callback="+name;
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
            window[name] = function(data) {
                resolve(data);
                document.getElementsByTagName('head')[0].removeChild(script);
                script = null;
                delete window[name];
            };
            document.getElementsByTagName('head')[0].appendChild(script);
        } );
    }

    // From http://stackoverflow.com/a/12034334/1757964
    var entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    function escapeHtml (string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    // ONLOAD STUFF

    // Update the backlog-dependent display stuff
    document.querySelector( "#select-backlog select" ).dispatchEvent( new Event( "change" ) );

    // In case we already have stuff in the edit-token field due to a reload
    document.getElementById( "edit-token" ).dispatchEvent( new Event( "keyup" ) );

    document.getElementById( "edit-token" ).disabled = false;
    document.getElementById( "submit-token" ).disabled = false;

    //apiFunctions.doAuthorizationRedirect();
} );
