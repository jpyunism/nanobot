"""Twitter / X channel setup contract."""

from nanobot.channels._manifest import field, required_fields
from nanobot.channels.contracts import ChannelSetupSpec
from nanobot.channels.plugin import ChannelPlugin
from nanobot.channels.twitter.validation import validate

SETUP_SPEC = ChannelSetupSpec(
    fields={
        "bearerToken": field("secret"),
        "apiKey": field("secret"),
        "apiKeySecret": field("secret"),
        "accessToken": field("secret"),
        "accessTokenSecret": field("secret"),
        "botUsername": field(),
        "pollIntervalSeconds": field("int", default=900),
        "searchQuery": field(),
        "language": field(default="en"),
        "allowFrom": field("list"),
        "groupPolicy": field(choices=("mention", "open"), default="open"),
        "maxMentionsPerPoll": field("int", default=20),
        "replyPrefix": field(default=""),
    },
    required=required_fields(
        "bearerToken",
        "apiKey",
        "apiKeySecret",
        "accessToken",
        "accessTokenSecret",
        "botUsername",
    ),
    official_url="https://developer.twitter.com/en/docs/twitter-api",
    validator=validate,
)

PLUGIN = ChannelPlugin(
    name="twitter",
    display_name="Twitter / X",
    runtime=f"{__package__}.runtime:TwitterChannel",
    setup=SETUP_SPEC,
)
