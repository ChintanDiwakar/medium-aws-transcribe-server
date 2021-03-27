var WebSocketServer = require('ws').Server;
const WebSocket = require('ws')
var mic = require('microphone-stream');
var wss = new WebSocketServer({ port: 3000 });
const crypto = require('crypto'); // tot sign our pre-signed URL
const v4 = require('./lib/aws-signature-v4'); // to generate our pre-signed URL
var marshaller = require("@aws-sdk/eventstream-marshaller"); // for converting binary event stream messages to and from JSON
let socketError = false;
let transcribeException = false;

var util_utf8_node = require("@aws-sdk/util-utf8-node"); // utilities for encoding and decoding UTF8

let inputs
var eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8); // our global variables for managing state


function pcmEncode(input) {
    var offset = 0;
    var buffer = new ArrayBuffer(input.length * 2);
    var view = new DataView(buffer);
    for (var i = 0; i < input.length; i++, offset += 2) {
        var s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

function downsampleBuffer(buffer, inputSampleRate = 44100, outputSampleRate = 16000) {

    if (outputSampleRate === inputSampleRate) {
        return buffer;
    }

    var sampleRateRatio = inputSampleRate / outputSampleRate;
    var newLength = Math.round(buffer.length / sampleRateRatio);
    var result = new Float32Array(newLength);
    var offsetResult = 0;
    var offsetBuffer = 0;

    while (offsetResult < result.length) {

        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);

        var accum = 0,
            count = 0;

        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;

    }

    return result;

}
wss.on('connection', (socket) => {
    let url = createPresignedUrl();

    socketAWS = new WebSocket(url);
    socketAWS.binaryType = "arraybuffer";

    let sampleRate = 0;
    socketAWS.onopen = function () {
        socket.on('message', (rawAudioChunk) => {

            let binary = convertAudioToBinaryMessage(rawAudioChunk);

            if (rawAudioChunk === 'close') {
                console.log('Client ordered to close the server !')
                var emptyMessage = getAudioEventMessage(Buffer.from(Buffer.from([])));
                var emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
                socketAWS.send(emptyBuffer);

            }

            if (socketAWS.readyState === socketAWS.OPEN) {


                socketAWS.send(binary);
            }
        });
        wireSocketEvents();
    }

    function convertAudioToBinaryMessage(audioChunk, inputSampleRate) {

        var raw = mic.toRaw(audioChunk);
        if (raw == null) return;
        inputSampleRate = 48000

        var downsampledBuffer = downsampleBuffer(raw, inputSampleRate, 44100);
        var pcmEncodedBuffer = pcmEncode(downsampledBuffer);

        var audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));

        var binary = eventStreamMarshaller.marshall(audioEventMessage);

        return binary;
    }


    function getAudioEventMessage(buffer) {
        // wrap the audio data in a JSON envelope
        return {
            headers: {
                ':message-type': {
                    type: 'string',
                    value: 'event'
                },
                ':event-type': {
                    type: 'string',
                    value: 'AudioEvent'
                }
            },
            body: buffer
        };
    }


    function createPresignedUrl() {
        region = 'ap-southeast-2'
        // sampleRate =
        languageCode = "en-US"
        let endpoint = "transcribestreaming." + region + ".amazonaws.com:8443";



        return v4.createPresignedURL(

            'GET',
            endpoint,
            '/stream-transcription-websocket',
            'transcribe',
            crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
            'key': 'YOUR ACCESS KEY',
            'secret': 'YOUR SECRET KEY',
            'sessionToken': '',
            'protocol': 'wss',
            'expires': 15,
            'region': region,
            'query': "language-code=" + languageCode + "&media-encoding=pcm&vocabulary-name=letters&sample-rate=" + 44100
        }
        );
    }


    function wireSocketEvents() {

        socketAWS.onmessage = function (message) {

            var messageWrapper = eventStreamMarshaller.unmarshall(Buffer.from(message.data));
            var messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));

            if (messageWrapper.headers[":message-type"].value === "event") {
                handleEventStreamMessage(messageBody);

            } else {
                transcribeException = true;

                console.log('Server is stopped')
            }
        };

        socketAWS.onerror = function () {
            socketError = true;
            console.log('WebSocket connection error. Try again.');
            toggleStartStop();
        };

        socketAWS.onclose = function (closeEvent) {


            if (!socketError && !transcribeException) {
                if (closeEvent.code != 1000) {
                    console.log('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason);
                }


            }
        };
    }
    transcro = ''
    var handleEventStreamMessage = function handleEventStreamMessage(messageJson) {
        var results = messageJson.Transcript.Results;



        if (results.length > 0) {

            if (results[0].Alternatives.length > 0) {
                var transcript = results[0].Alternatives[0].Transcript;

                transcript = decodeURIComponent(escape(transcript));

                transcro += transcript

                if (!results[0].IsPartial) {
                    finalResult = results[0].Alternatives[0].Transcript
                    socket.send(finalResult) // Sending Data to Client 
                    console.log(results[0].Alternatives[0].Transcript)

                }
            }
        }
    };
});