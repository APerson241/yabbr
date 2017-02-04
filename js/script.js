document.addEventListener( "DOMContentLoaded", function() {
    var globals = {
        "currentCat": "",
        "currentPage": "",
        "iterator": "",
        "editToken": ""
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
            console.log(count);
            document.getElementById( "backlog-size" ).innerHTML = "(Size: " + count.toLocaleString() + " pages)";
        } );
    }

    function loadDupeRefNamesView( pageText ) {
        var refMatches = pageText.match(/<ref[\s\S]*?(?:<\/ref>|\/>)/g );
        var refs = [];
        refMatches.forEach( function ( ref ) {
            var match = /^<ref\s+name\s*=\s*"?([^>\/\\"']+)"?\s*(\/?)>/.exec( ref );
            if( match && match[1] && match[1].trim().length ) {
                refs.push( { "ref": ref, "name": match[1].trim(), "selfclosing": !!match[2] } );
            }
        } );
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

        document.getElementById( "edit-panel" ).innerHTML = "";
        var listElement = document.createElement( "ul" );
        Object.keys( dupeRefs ).forEach( function ( dupeRefName ) {
            var newInnerElement = document.createElement( "li" );
            var newInnerElementHtml = "";
            newInnerElementHtml += "<span class='ref-name'>" + dupeRefName +
                "</span> <span class='ref-count'>(" + dupeRefs[dupeRefName].length +
                " total references)</span><ul>";
            var ourDupeRefs = dupeRefs[dupeRefName];
            for( var i = 0; i < ourDupeRefs.length; i++ ) {
                if( ourDupeRefs[i].selfclosing ) {

                    // Count the # of selfclosing refs after this
                    for( var j = i; j < ourDupeRefs.length; j++ ) {
                        if( !ourDupeRefs[j].selfclosing ) break;
                    }

                    newInnerElementHtml += "<li>(" + ( j - i ) +
                        " self-closing reference" + ( ( j - i === 1 ) ? "" : "s" ) +
                        ")</li>";
                    i = j - 1;
                } else {
                    newInnerElementHtml += "<li><span class='vertical-align'>" +
                        "<textarea class='mw-ui-input' data-refname='" +
                        dupeRefName + "' data-refnum='" + i + "'>" +
                        escapeHtml( ourDupeRefs[i].ref ) + "</textarea></span></li>";
                }
            }
            newInnerElementHtml += "</ul>";
            newInnerElement.innerHTML = newInnerElementHtml;
            listElement.appendChild( newInnerElement );
        } );
        document.getElementById( "edit-panel" ).appendChild( listElement );

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

                    // Get the original text of this ref in the page text
                    var originalText = dupeRefs[refName][refNum].ref;
                    pageText = pageText.replace( originalText, textArea.value );
                } );

                // Save our changes to the page text
                apiFunctions.savePage( globals.currentPage, pageText,
                                       globals.editToken, "Fixing duplicate references with YABBR" )
                    .then( function ( response ) {
                        console.log(response);
                        savePageButton.innerHTML = "Save page";
                        document.getElementById( "save-result" ).innerHTML = response;

                        setTimeout( updateCategorySize, 500 );
                        nextPage();
                    } )
            }.bind( this ) );
        }.bind( this ) );

        function enableSavePageButton () { document.getElementById( "save-page" ).disabled = false; }

        // Make the text areas taller
        document.querySelectorAll( "#edit-panel textarea" ).forEach( function ( textArea ) {
            textArea.style.height = textArea.scrollHeight + "px";
            textArea.addEventListener( "input", function () {
                document.getElementById( "save-page" ).disabled = !globals.editToken;
            } );
        } );
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
        }
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

    function makeWikilink( pageName ) {
        var link = document.createElement( "a" );
        link.href = "https://en.wikipedia.org/wiki/" + pageName;
        link.appendChild( document.createTextNode( pageName ) );
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
} );
