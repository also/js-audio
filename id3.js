function bytesToString(bytes) {
    return String.fromCharCode.apply(String, Array.prototype.slice.apply(bytes));
}

function extractAsciiString(buffer, start, length) {
    return bytesToString(new Uint8Array(buffer, start, length));
}

function extractUtf16String(buffer, start, length) {
    var sourceChars = new Uint8Array(buffer, start, length);
    // TODO only copy if necessary
    var chars = new Uint8Array(sourceChars.length);
    chars.set(sourceChars);

    // TODO handle BOM
    var values = new Uint16Array(chars.buffer);

    return decodeUtf16(values.subarray(1));
}

// http://www.ietf.org/rfc/rfc2781.txt
function decodeUtf16(w) {
    var i = 0;
    var len = w.length;
    var w1, w2;
    var charCodes = [];
    while (i < len) {
        var w1 = w[i++];
        if ((w1 & 0xF800) !== 0xD800) { // w1 < 0xD800 || w1 > 0xDFFF
            charCodes.push(w1);
            continue;
        }
        if ((w1 & 0xFC00) === 0xD800) { // w1 >= 0xD800 && w1 <= 0xDBFF
            throw new RangeError('Invalid octet 0x' + w1.toString(16) + ' at offset ' + (i - 1));
        }
        if (i === len) {
            throw new RangeError('Expected additional octet');
        }
        w2 = w[i++];
        if ((w2 & 0xFC00) !== 0xDC00) { // w2 < 0xDC00 || w2 > 0xDFFF)
            throw new RangeError('Invalid octet 0x' + w2.toString(16) + ' at offset ' + (i - 1));
        }
        charCodes.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000);
    }
    return String.fromCharCode.apply(String, charCodes);
}

function Id3Frame() {}

function Id3Parser (blob) {
    var BUFFER_SIZE = 64;
    this.blob = blob;

    var that = this;

    function handleHeader(e) {
        var headerOffset = 0;
        var header = e.target.result;
        var headerView = new DataView(header);

        function readFrameHeader() {
            frame = new Id3Frame();
            id3.frames.push(frame);
            frame.id = extractAsciiString(header, i - headerOffset, 4);
            i += 4;
            frame.size = headerView.getUint32(i - headerOffset);
            i += 4;
            frame.flags = headerView.getUint16(i - headerOffset);
            i += 2;
            frame.offset = i;

            if (frame.id === 'APIC') {
                frame.actualSize = frame.size;
                frame.size = BUFFER_SIZE;
            }
        }

        function readFrameData() {
            if (frame.id[0] === 'T' && frame.id !== 'TXXX') {
                var encoding = headerView.getUint8(i - headerOffset);
                if (encoding === 0) {
                    frame.value = extractAsciiString(header, i - headerOffset + 1, frame.size - 1);
                }
                else {
                    frame.value = extractUtf16String(header, i - headerOffset + 1, frame.size - 1);
                }
            }
            else if (frame.id === 'APIC') {
                var encoding = headerView.getUint8(i - headerOffset);
                var chars = new Uint8Array(header, i + 1 - headerOffset, frame.size - 1);
                frame.size = frame.actualSize;

                var mimeTypeLen = Array.prototype.indexOf.call(chars, 0);
                frame.mimeType = bytesToString(chars.subarray(0, mimeTypeLen));
                frame.pictureType = chars[mimeTypeLen + 1];
                chars = chars.subarray(mimeTypeLen + 2);
                var offset;
                if (encoding === 0) {
                    var descriptionLen = Array.prototype.indexOf.call(chars, 0);
                    frame.description = bytesToString(chars.subarray(0, descriptionLen));
                    offset = mimeTypeLen + descriptionLen + 4;
                }
                else {
                    // FIXME handle utf-16 descriptions
                    console.log('unhandled utf-8 description');
                }
                frame.value = that.blob.slice(i + offset, frame.actualSize - offset, frame.mimeType);
            }
            else {
                frame.value = extractAsciiString(header, i - headerOffset, frame.size);
            }
            i += frame.size;
            frame = null;
        }

        if (extractAsciiString(header, 0, 3) === 'ID3') {
            var id3 = {};
            that.id3 = id3;
            id3.majorVersion = headerView.getUint8(3);
            id3.minorVersion = headerView.getUint8(4);
            id3.flags = headerView.getUint8(5);
            id3.unsynchronisation = !!(0x80 & id3.flags);
            id3.extended =          !!(0x40 & id3.flags);
            id3.experimental =      !!(0x20 & id3.flags);
            id3.length = (headerView.getUint8(6) << (3 * 7)) +
                         (headerView.getUint8(7) << (2 * 7)) +
                         (headerView.getUint8(8) << (1 * 7)) +
                         (headerView.getUint8(9) << (0 * 7));
            id3.frames = [];
            var i = 10;
            var max = id3.length + 10;
            var frame;

            var maxOffset = BUFFER_SIZE;
            var exhausted = false;
            function read() {
                while (true) {
                    if (i >= max) {
                        break;
                    }
                    if (exhausted) {
                        headerReader = new FileReader();
                        this.headerReader = headerReader;
                        headerReader.onloadend = function () {
                            header = headerReader.result;
                            headerView = new DataView(header);
                            exhausted = false;
                            read();
                        }
                        headerOffset = i;
                        headerReader.readAsArrayBuffer(blob.slice(headerOffset, BUFFER_SIZE));
                        break;
                    }

                    if (!frame) {
                        if (i + 10 - headerOffset > BUFFER_SIZE) {
                            exhausted = true;
                        }
                        else {
                            readFrameHeader();
                        }
                    }
                    else {
                        if (frame.size > BUFFER_SIZE) {
                            // TODO frame too big
                            i += frame.size;
                            frame = null;
                        }
                        else if (i + frame.size - headerOffset > BUFFER_SIZE) {
                            exhausted = true;
                        }
                        else {
                            var f = frame;
                            readFrameData();
                        }
                    }
                }
            }
            read();
        }
    }
    var headerReader = new FileReader();
    headerReader.onloadend = handleHeader;
    headerReader.readAsArrayBuffer(blob.slice(0, BUFFER_SIZE));
}
