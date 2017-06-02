import flask
import os
import configparser
import mwoauth

CONFIG_FILENAME = "config.ini"

app = flask.Flask(__name__)

# Load configuration
curr_dir = os.path.dirname(__file__)
config = configparser.ConfigParser()
config.optionxform = str
config.read(os.path.join(curr_dir, CONFIG_FILENAME))
app.config.update(dict(config.items("CREDS")))

# Generate consumer token
consumer_token = mwoauth.ConsumerToken(
  app.config["CONSUMER_KEY"], app.config["CONSUMER_SECRET"])

@app.route('/')
def index():
  greeting = app.config["GREETING"]
  username = flask.session.get("username", None)
  return flask.render_template(
    "index.html", username=username, greeting=greeting)

@app.route("/login")
def login():
  try:
    redirect, request_token = mwoauth.initiate(app.config["OAUTH_MWURI"], consumer_token)
  except Exception:
    app.logger.exception("mwoauth.initiate failed")
    return flask.redirect(flask.url_for('index'))
  else:
    # Convert request_token into a dictionary
    request_token_dict = dict(zip(request_token._fields, request_token))
    flask.session["request_token"] = request_token_dict
    return flask.redirect(redirect)

@app.route("/oauth-callback")
def oauth_callback():
  if "request_token" not in flask.session:
    app.logger.exception("OAuth callback failed. Are cookies disabled?")
    return flask.redirect(flask.url_for("index"))
  try:
    access_token = mwoauth.complete(app.config["OAUTH_MWURI"], consumer_token, mwoauth.RequestToken(**flask.session["request_token"]), flask.request.query_string)
    identity = mwoauth.identify(app.config["OAUTH_MWURI"], consumer_token, access_token)
  except Exception:
    app.logger.exception("OAuth authentication failed.")
  else:
    flask.session["access_token"] = dict(zip(access_token._fields, access_token))
    flask.session["username"] = identity["username"]

  return flask.redirect(flask.url_for("index"))

@app.route('/logout')
def logout():
  """Log the user out by clearing their session."""
  flask.session.clear()
  return flask.redirect(flask.url_for('index'))
