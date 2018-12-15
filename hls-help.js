// modules
const request = require('request');
const m3u8 = require('m3u8-parsed');
const hlsdl = require('hls-download');
const shlp = require('sei-helper');

// req
let fullUrl  = '';
let baseUrl  = '';
let quality  = '';
let file     = '';
let parts    = 10;
let isStreamB = false;
let isStreamS = '';

// cfg
let m3u8cfg;
let getM3u8Sheet;

// start
getStream();

// program
async function getStream(){
    
    fullUrl = await shlp.question(`m3u8 video url`);
    baseUrl = fullUrl.replace(fullUrl.split('/')[fullUrl.split('/').length-1],'');
    
    getM3u8Sheet = await getData(fullUrl);
    if(!getM3u8Sheet.err || getM3u8Sheet.err){
        m3u8cfg = m3u8(getM3u8Sheet.res.body);
        if(m3u8cfg.segments && m3u8cfg.segments.length>0){
            await dlStream(m3u8cfg,fullUrl);
        }
        else if(m3u8cfg.playlists){
            for(let i=0;i<m3u8cfg.playlists.length;i++){
                let plEl = m3u8cfg.playlists[i];
                let resolution = plEl.attributes.RESOLUTION ? `${plEl.attributes.RESOLUTION.width}x${plEl.attributes.RESOLUTION.height}` : `????x????`;
                console.log(
                    `[${i}] ${resolution} (${Math.round(plEl.attributes.BANDWIDTH/1024)}KiB/s)`,
                    '\n `-'+m3u8cfg.playlists[i].uri
                );
            }
            quality = await shlp.question(`stream number`);
            plUri = m3u8cfg.playlists[quality].uri;
            fullUrl = (!plUri.match(/^http/) ? baseUrl : '') + plUri;
            baseUrl = fullUrl.replace(fullUrl.split('/')[fullUrl.split('/').length-1],'');
            console.log(fullUrl);
            getM3u8Sheet = await getData(fullUrl);
            if(!getM3u8Sheet.err || getM3u8Sheet.err){
                m3u8cfg = m3u8(getM3u8Sheet.res.body);
                await dlStream(m3u8cfg,fullUrl);
            }
            else{
                console.log(JSON.stringify(getM3u8Sheet,null,'\t'));
            }
        }
        else{
            console.log(m3u8cfg);
        }
    }
    else{
        console.log(JSON.stringify(getM3u8Sheet,null,'\t'));
    }
    
}

// dl
async function dlStream(m3u8cfg,fullUrl){
    process.chdir(`${__dirname}/downloads/`);
    file = file == '' ? await shlp.question(`ts filename`) : file;
    isStreamS = isStreamB ? 'y' : await shlp.question(`is stream [y/N]`);
    if (['Y', 'y'].includes(isStreamS[0])) {
        isStreamB = true;
    }
    let mystream = await hlsdl({ fn: file, baseurl: baseUrl, m3u8json: m3u8cfg, pcount: parts, rcount: 100, typeStream: isStreamB });
    console.log(mystream);
    if(isStreamB){
        // m3u8cfg = {};
        // await dlStream(m3u8cfg,fullUrl); 
    }
}

// request
function getData(options){
    return new Promise((resolve) => {
        request(options, (err, res) => {
            if (err){
                res = err;
                resolve({ "err": "0", res });
            }
            if (res.statusCode != 200) {
                resolve({ "err": res.statusCode, res });
            }
            resolve({res});
        });
    });
}