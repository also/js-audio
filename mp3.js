function MpegFrame() {}

function Mp3Reader (blob, offset) {
    var BUFFER_SIZE = 4096;
    var AUDIO_VERSIONS = [2.5, -1, 2, 1];
    var LAYERS = [-1, 3, 2, 1];
    var SAMPLING_RATES = [[11025, -1, 22050, 44100],
                          [12000, -1, 24000, 48000],
                          [8000 , -1, 16000, 32000],
                          [0,     -1,     0,     0]];
    var BITRATES = [[null,
                     [  0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],   // V2.5 L3
                     [  0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],   // V2.5 L2
                     [  0,  32,  48,  56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256]],  // V2.5 L1
                    null,
                    [null,
                     [  0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],   // V2 L3
                     [  0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160],   // V2 L2
                     [  0,  32,  48,  56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256]],  // V2 L1
                    [null,
                     [  0,  32,  40,  48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320],   // V1 L3
                     [  0,  32,  48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384],   // V1 L2
                     [  0,  32,  64,  96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]]]; // V1 L1

    var CHANNEL_MODES;
    var SLOT_SIZES = [-1, 1, 1, 4];
    this.blob = blob;

    var reader;

    var frames = [];
    this.frames = frames;

    var data = new Uint8Array(0);
    var i = 0;

    function read(frameCallback) {
        var done = false;
        while (true) {
            if (offset >= blob.length) {
                console.log('done')
                return;
            }
            if (i >= data.length) {
                offset += i;
                reader = new FileReader();
                reader.onloadend = function(e) {
                    data = new Uint8Array(e.target.result);
                    i = 0;
                    read(frameCallback);
                }
                reader.readAsArrayBuffer(blob.slice(offset, BUFFER_SIZE));
                break;
            }
            // TODO ensure we have a full header + side info
            if (data[i] === 0xff && (data[i + 1] & 0xe0) === 0xe0) {
                var frame = readHeader(i);
                if (!frame.valid) {
                    console.log('invalid frame header');
                    return;
                }
                done = !frameCallback(frame);
                frames.push(frame);
                i += frame.size;
                if (done) {
                    break;
                }
            }
            else {
                console.log('missing sync');
                return;
            }
        }

        function readHeader(pos) {
            var a = data[pos + 1];
            var b = data[pos + 2];
            var c = data[pos + 3];

            var audioVersionId =    (a & 0x18) >> 3;
            var layerIndex =        (a & 0x06) >> 1;
            var protection =        (a & 0x01);
            var bitrateIndex =      (b & 0xf0) >> 4;
            var samplingRateIndex = (b & 0x0c) >> 2;
            var paddingBit =        (b & 0x02) >> 1;
            var privateBit =        (b & 0x01);
            var channelModeIndex =  (c & 0xc0) >> 6;
            var modeExtension =     (c & 0x30) >> 4;
            var copyrightBit =      (c & 0x08) >> 3;
            var originalBit =       (c & 0x04) >> 2;
            var emphasis =          (c & 0x03);

            var valid = true;
            if (audioVersionId === 1) {
                valid = false;
            }
            else if (layerIndex === 0) {
                valid = false;
            }
            else if (bitrateIndex === 15) {
                valid = false;
            }
            else if (samplingRateIndex === 3) {
                valid = false;
            }
            else if (emphasis === 2) {
                valid = false;
            }

            var version, layer, bitrate, samplingRate, samples, slotSize, frameSize, mainDataBegin;
            if (valid) {
                version = AUDIO_VERSIONS[audioVersionId];
                layer = LAYERS[layerIndex];
                bitrate = BITRATES[audioVersionId][layerIndex][bitrateIndex];
                samplingRate = SAMPLING_RATES[samplingRateIndex][audioVersionId];
                if (layer === 1){
                    samples = 384;
                }
                else if (layer === 2) {
                    samples = 1152;
                }
                else {
                    if (version === 1) {
                        samples = 1152;
                    }
                    else {
                        samples = 576;
                    }
                }
                slotSize = layer === 1 ? 4 : 1;
                frameSize = Math.floor(((samples / 8 * bitrate * 1000) / samplingRate + slotSize * paddingBit) / slotSize) * slotSize;

                var mainDataBeginOffset = pos + 4 + protection * 2;
                var mainDataBegin = data[mainDataBeginOffset] << 8 + data[mainDataBeginOffset] & 0x80;
            }

            var frame = new MpegFrame();
            frame.offset = pos + offset;
            frame.valid = valid;
            frame.size = frameSize;
            frame.version = version;
            frame.layer = layer;
            frame.protection = !!protection;
            frame.bitrate = bitrate;
            frame.samplingRate = samplingRate;
            frame.padding = paddingBit;
            frame.privateBit = !!privateBit;
            frame.channelModeIndex = channelModeIndex; // TODO convert to channel mode?
            frame.modeExtension = modeExtension; // TODO  ?
            frame.copyright = !!copyrightBit;
            frame.original = !!originalBit;
            frame.samples = samples;
            frame.mainDataBegin = mainDataBegin;

            return frame;
        }
    }

    this.read = read;

    var blobOffset = offset;

    function getBuffer(samples, context, callback) {
        var start = blobOffset;
        console.log(start);
        var length = 0;
        var samplesSoFar = 0;
        function frameCallback(frame) {
            length += frame.size;
            blobOffset += frame.size;
            samplesSoFar += frame.samples;

            if (samplesSoFar >= samples) {
                var chunkReader = new FileReader();
                chunkReader.onloadend = function(e) {
                    var buffer = context.createBuffer(e.target.result, false);
                    callback(buffer);
                };
                chunkReader.readAsArrayBuffer(blob.slice(start, length, 'audio/mp3'));
                return false;
            }
            else {
                return true;
            }
        }
        read(frameCallback);
    }

    this.getBuffer = getBuffer;

    var empty = new Float32Array(0);
    var currentBuffer = empty;

    function fill(buffer, offset, callback) {
        var written = 0;
        if (currentBuffer.length > 0) {
            if (buffer.length < currentBuffer.length) {
                buffer.set(currentBuffer.subarray(0, buffer.length));
                currentBuffer = currentBuffer.subarray(buffer.length);
                callback(buffer);
                return;
            }
            else {
                buffer.set(currentBuffer);
                written = currentBuffer.length;
                currentBuffer = empty;
            }
        }
    }
}

function showFrameInfo(frame) {
    console.log('at ' + frame.offset, 'audioVersion', frame.version, 'layer', frame.layer, 'protection?', frame.protection, 'mainDataBegin', frame.mainDataBegin, 'bytes', frame.size, 'next', frame.offset + frame.size);
}
