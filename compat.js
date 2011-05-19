(function () {
var typedArrays = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array];
if (window.Float64Array) {
    typedArrays.push(Float64Array);
}

// fix for webkit pre slice rename
if (!Float32Array.prototype.subarray) {
    typedArrays.forEach(function (cls) {
        cls.prototype.subarray = cls.prototype.slice;
    });
}
// fix for https://bugzilla.mozilla.org/show_bug.cgi?id=637643
else if (new Int8Array([0, 1, 0]).subarray(1).subarray(1)[0]) {
    function subarray (begin, end) {
        if (arguments.length === 0) {
            // duplicate the array
            return new this.constructor(this.buffer, this.byteOffset, this.length);
        }
        else {
            if (begin < 0) {
                // relative to end
                begin += this.length;
            }
            // clamp to 0, length
            begin = Math.max(0, Math.min(this.length, begin));
            if (arguments.length < 2) {
                // slice to end
                end = this.length;
            }
            else {
                if (end < 0) {
                    // relative to end
                    end += this.length;
                }
                // clamp to begin, length
                end = Math.max(begin, Math.min(this.length, end));
            }

            var byteOffset = this.byteOffset + begin * this.BYTES_PER_ELEMENT;
            return new this.constructor(this.buffer, byteOffset, end - begin);
        }
    }
    typedArrays.forEach(function (cls) {
        cls.prototype.subarray = subarray;
    });
}

if (!FileReader.prototype.readAsArrayBuffer) {
    FileReader.prototype.readAsArrayBuffer = function readAsArrayBuffer () {
        this.readAsBinaryString.apply(this, arguments);
        this.__defineGetter__('resultString', this.__lookupGetter__('result'));
        this.__defineGetter__('result', function () {
            var string = this.resultString;
            var result = new Uint8Array(string.length);
            for (var i = 0; i < string.length; i++) {
                result[i] = string.charCodeAt(i);
            }
            return result.buffer;
        });
    };
}


if (!window.DataView) {
    function DataView(buffer) {
        this.buffer = buffer;
    }

    // DataView polyfill
    DataView.prototype = {
        get: function (cls, byteOffset, littleEndian) {
            var buffer;
            if (!littleEndian) {
                var sourceChars = new Uint8Array(this.buffer, byteOffset, cls.BYTES_PER_ELEMENT);
                var destChars = new Uint8Array(cls.BYTES_PER_ELEMENT);
                if (cls.BYTES_PER_ELEMENT === 2) {
                    destChars[0] = sourceChars[1];
                    destChars[1] = sourceChars[0];
                }
                else if (cls.BYTES_PER_ELEMENT === 4) {
                    destChars[0] = sourceChars[3];
                    destChars[1] = sourceChars[2];
                    destChars[2] = sourceChars[1];
                    destChars[3] = sourceChars[0];
                }
                else if (cls.BYTES_PER_ELEMENT === 8) {
                    destChars[0] = sourceChars[7];
                    destChars[1] = sourceChars[6];
                    destChars[2] = sourceChars[5];
                    destChars[3] = sourceChars[4];
                    destChars[4] = sourceChars[3];
                    destChars[5] = sourceChars[2];
                    destChars[6] = sourceChars[1];
                    destChars[7] = sourceChars[0];
                }
                buffer = destChars.buffer;
            }
            else if (byteOffset % cls.BYTES_PER_ELEMENT) {
                var sourceChars = new Uint8Array(this.buffer, byteOffset, cls.BYTES_PER_ELEMENT);
                var destChars = new Uint8Array(cls.BYTES_PER_ELEMENT);
                destChars.set(sourceChars);
                buffer = destChars.buffer;
            }
            else {
                buffer = this.buffer
            }
            return new cls(buffer, 0, 1)[0];
        },

        getUint32: function (byteOffset, littleEndian) {
            return this.get(Uint32Array, byteOffset, littleEndian);
        },

        getUint16: function (byteOffset, littleEndian) {
            return this.get(Uint16Array, byteOffset, littleEndian);
        },
        
        getUint8: function (byteOffset) {
            return new Uint8Array(this.buffer, byteOffset, 1)[0];
        }
    };
    window.DataView = DataView;
}

// TODO opera?
var slice = Blob.prototype.webkitSlice || Blob.prototype.mozSlice;
if (!slice) {
    if (window.BlobBuilder) {
        var bb = new BlobBuilder();
        bb.append("abcd");
        if (bb.getBlob().slice(2, 2).size !== 2) {
            slice = Blob.prototype.slice;
        }
    }
    if (!slice) {
        var origSlice = Blob.prototype.slice;
        slice = function slice(start, end) {
            return origSlice.apply(this, [start, end - start]);
        };
    }
}
Blob.prototype.slice = slice;

})();