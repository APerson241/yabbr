#!/usr/bin/env python

import cgitb; cgitb.enable()

import cgi
import json
import requests
import sys
import urllib

from mwoauth import ConsumerToken, Handshaker

OAUTH_ROOT = "https://meta.wikimedia.org/w/index.php?title=Special:OAuth"

CONSUMER_TOKEN = "a38bdea381b2d3cb27c54c9224de4013"
SECRET_TOKEN = "93e2426dda047c6ff646dd7d0897be3101d7522e"

# Derived from http://stackoverflow.com/a/6123179/1757964
def print_redirect_page(url):
    print("Content-Type: text/html")
    print("Location: {}".format(url))
    print
    print("<html><head><meta charset=\"utf-8\" /><meta http-equiv=\"refresh\" content=\"0;url={}\" />".format(url))
    print("<title>You're going to be redirected</title>")
    print("</head><body>Redirecting... <a href=\"{}\"".format(url))
    print(">Click here if you aren't redirected</a></body></html>")


form = cgi.FieldStorage()

handshaker = Handshaker("https://en.wikipedia.org/w/index.php",
                        ConsumerToken(CONSUMER_TOKEN,
                                      SECRET_TOKEN))
redirect, request_token = handshaker.initiate()
print_redirect_page(redirect)
sys.exit(0)
params = dict(
    oauth_calllback="oob",
    oauth_consumer_key=CONSUMER_TOKEN,
    oauth_version="1.0"
)
result = requests.get(OAUTH_ROOT + "/initiate", params)
print(result.text.encode("utf-8"))
