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

try:
    wiki = wikitools.Wiki("https://en.wikipedia.org/w/api.php")
    password = open("/home/daniel/Documents/GitHub/yabbr/cgi-bin/p.txt").read().strip()
    wiki.login("Enterprisey", password)
    page = wikitools.Page(wiki, title=form["title"].value)
    result = page.edit(text=form["text"].value, summary=form["summary"].value)
    result_string = json.dumps(result)
    print(result_string)
except Exception as e:
    print(e)
#params = dict(
#    action="edit",
#    title=form["title"].value,
#    text=form["text"].value,
#    summary=form["summary"].value,
#    token=urllib.quote(form["token"].value)
#)
#headers = dict()
#headers["Content-Type"] = "application/x-www-form-urlencoded"
#result = requests.post("https://en.wikipedia.org/w/api.php", params, headers=headers)
#print(result.text.encode("utf-8"))
#sys.exit(0)
#req = wikitools.api.APIRequest(wiki, params, write=True)
#result = req.query()

#print(result)
