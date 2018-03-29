/**
 * Simple Emoticon filter that converts plain-text emoticons to <DIV> with css class names based on the emoticon
 *
 * @param megaChat
 * @returns {EmoticonsFilter}
 * @constructor
 */
var EmoticonsFilter = function(megaChat) {
    var self = this;
    // only match emojis when they are not in between of rtf tags.
    self.emoticonsRegExp =
            /((^|\W?)(:[a-zA-Z0-9\-_]+:)(?!(.(?!<pre))*?<\/pre>)(\s|$))/gi;
    self.map = {};

    self.emoticonsLoading = megaChat.getEmojiDataSet('emojis')
        .done(function(emojis) {
            self.emojis = emojis;
            $.each(emojis, function(k, meta) {
                self.map[meta.n.toLowerCase()] = meta.u;
            });
        });
    self.reservedEmotions = {};
    self.reservedEmotions["tm"] = '\u2122';

    megaChat.bind("onBeforeRenderMessage", function(e, eventData) {
        self.processMessage(e, eventData);
    });
    megaChat.bind("onBeforeSendMessage", function(e, messageObject) {
        self.processOutgoingMessage(e, messageObject);
    });

    return this;
};

EmoticonsFilter.prototype.processMessage = function(e, eventData) {
    var self = this;

    if (eventData.message.decrypted === false) {
        return;
    }

    if (self.emoticonsLoading.state() === 'pending') {
        self.emoticonsLoading.done(function() {
            self.processMessage(e, eventData);
        });
        return;
    }
    // ignore if emoticons are already processed
    if (!eventData.message.processedBy) {
        eventData.message.processedBy = {};
    }
    if (eventData.message.processedBy['emojiFltr'] === true) {
        return;
    }

    // use the HTML version of the message if such exists (the HTML version should be generated by hooks/filters on the
    // client side.
    var textContents;
    if (eventData.message.textContents) {
        textContents = eventData.message.textContents;
    } else {
        return; // not yet decrypted.
    }


    var messageContents = eventData.message.messageHtml ? eventData.message.messageHtml : textContents;

    messageContents = self.processHtmlMessage(messageContents);

    if (messageContents) {
        eventData.message.messageHtml = messageContents;
    }
    eventData.message.processedBy['emojiFltr'] = true;
};

/**
 * Simple method of converting utf8 strings containing utf emojis, to strings containing HTML code (e.g. <img /> tags)
 * with emojis as images.
 *
 * Note: any code that uses this function, should implement its own way of tracking if a message was already parsed
 * (and skip double parsing of the same message twice, since this may create weird looking html code).
 *
 * Note 2: any code that uses this function, should ALWAYS take care of eventual XSS
 *
 * @param messageContents {string}
 */
EmoticonsFilter.prototype.processHtmlMessage = function(messageContents) {
    var self = this;

    if (!messageContents) {
        return; // ignore, maybe its a system message (or composing/paused composing notification)
    }
    // the rtf convertion of ` and ``` so anything in between will not be interpreted by emoji filter.
    messageContents = messageContents.replace(
            new RegExp('(^|\\s)`{1}([^`\\n]{1,})`{1}', 'gi'), '$1<pre class="rtf-single">$2</pre>');
    messageContents = messageContents.replace(
            new RegExp('(^|\\s)`{3}(\n?)([^`]{1,})`{3}', 'gi'), '$1<pre class="rtf-multi">$3</pre>');
    // convert legacy :smile: emojis to utf
    messageContents = messageContents.replace(self.emoticonsRegExp, function(match, p1, p2, p3, p4) {
        var foundSlug = $.trim(p3.toLowerCase());
        // remove start/end ":"
        foundSlug = foundSlug.substr(1).substr(0, foundSlug.length - 2);

        var utf = self.map[foundSlug];
        if (self.reservedEmotions[foundSlug]) {
            return '<img class="emoji" draggable="false" alt="' + self.reservedEmotions[foundSlug] + '" src="' +
                    staticpath + 'images/mega/twemojis/2_v2/' + twemoji.size + '/' +
                    twemoji.convert.toCodePoint(self.reservedEmotions[foundSlug]) + twemoji.ext + '"/>';
        }
        if (!utf) {
            return match;
        }

        return p2 + utf + p4;
    });

    // convert any utf emojis to images
    messageContents = twemoji.parse(messageContents, {
        size: 72,
        callback: function(icon, options, variant) {
            return staticpath + 'images/mega/twemojis/2_v2/' + options.size + '/' + icon + options.ext;
        }
    });

    // inject the awesome onerror for twemojis
    messageContents = messageContents.replace(
        'class="emoji"',
        'class="emoji"'
    );

    // if only one emoji, make it big
    if (
        messageContents.substr(0, 4) === "<img" &&
        messageContents.substr(-1) === ">" &&
        messageContents.indexOf("<img", 1) === -1
    ) {
        messageContents = messageContents.replace(
            'class="emoji"',
            'class="emoji big"'
        );
    }
    // convert ` and ``` back for next step of filter.
    messageContents = messageContents.replace(
            new RegExp('(^|\\s)<pre class="rtf-single">(.*)<\/pre>{1}', 'gi'), '$1`$2`');
    messageContents = messageContents.replace(
            new RegExp('(^|\\s)<pre class="rtf-multi">(.*)<\/pre>{1}', 'gi'), '$1```$2```');
    return messageContents;
};

EmoticonsFilter.prototype.processOutgoingMessage = function(e, messageObject) {
    var self = this;
    if (self.emoticonsLoading.state() === 'pending') {
        self.emoticonsLoading.done(function() {
            self.processMessage(e, eventData);
        });
        return;
    }

    var contents = messageObject.textContents;

    if (!contents) {
        return; // ignore, maybe its a system message (or composing/paused composing notification)
    }
    // the rtf convertion of ` and ``` so anything in between will not be interpreted by emoji filter.
    contents = contents.replace(
            new RegExp('(^|\\s)`{1}([^`\\n]{1,})`{1}', 'gi'), '$1<pre class="rtf-single">$2</pre>');
    contents = contents.replace(
            new RegExp('(^|\\s)`{3}(\n?)([^`]{1,})`{3}', 'gi'), '$1<pre class="rtf-multi">$3</pre>');

    contents = contents.replace(self.emoticonsRegExp, function(match) {
        var origSlug = $.trim(match.toLowerCase());
        var foundSlug = origSlug;


        if (foundSlug.substr(0, 1) === ":" && foundSlug.substr(-1, 1) === ":") {
            foundSlug = foundSlug.substr(1, foundSlug.length - 2);
        }

        var utf = self.map[foundSlug];

        if (utf && !self.reservedEmotions[foundSlug]) {
            return match.replace(origSlug, utf);
        } else {
            return match;
        }
    });
    // convert ` and ``` back for next step of filter.
    contents = contents.replace(new RegExp('(^|\\s)<pre class="rtf-single">(.*)<\/pre>{1}', 'gi'), '$1`$2`');
    contents = contents.replace(new RegExp('(^|\\s)<pre class="rtf-multi">(.*)<\/pre>{1}', 'gi'), '$1```$2```');
    messageObject.textContents = contents;
};

EmoticonsFilter.prototype.fromUtfToShort = function(s) {
    var self = this;
    var cached = {};
    return s.replace(/[^\x00-\x7F]{1,}/g, function(match, pos) {
        if (cached[match]) {
            return ":" + cached[match] + ":";
        }
        var found = false;
        Object.keys(self.map).forEach(function(slug) {
            if (self.reservedEmotions[slug]) {
                return false;
            }
            var utf = self.map[slug];
            cached[utf] = slug;

            if (!found && utf === match) {
                found = slug;
                return false;
            }
        });

        return found ? (":" + found  + ":") : match;
    });
};
