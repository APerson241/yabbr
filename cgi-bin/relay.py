#!/usr/bin/env python

import cgitb; cgitb.enable()

import cgi
import json
import requests
import sys
import urllib

import wikitools

print("Content-Type: application/json")
print

form = cgi.FieldStorage()

#if "token" not in form:
#    print("Error! Token not provided.")
#    sys.exit(0)

wiki = wikitools.Wiki("https://en.wikipedia.org/w/api.php")
wiki.login("Enterprisey", open("/home/daniel/Documents/GitHub/yabbr/cgi-bin/p.txt").read().strip())
print(json.dumps(wikitools.Page(wiki, title=form["title"].value).edit(text=form["text"].value, summary=form["summary"].value)))
sys.exit(0)
params = dict(
    action="edit",
    title=form["title"].value,
    text=form["text"].value,
    summary=form["summary"].value,
    token=urllib.quote(form["token"].value)
)
#headers = dict()
#headers["Content-Type"] = "application/x-www-form-urlencoded"
#result = requests.post("https://en.wikipedia.org/w/api.php", params, headers=headers)
#print(result.text.encode("utf-8"))
#sys.exit(0)
#req = wikitools.api.APIRequest(wiki, params, write=True)
#result = req.query()

#print(result)
