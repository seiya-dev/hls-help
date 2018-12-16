#!/usr/bin/env node

// modules
const request = require('request');
const m3u8 = require('m3u8-parsed');
const hlsdl = require('hls-download');
const shlp = require('sei-helper');
const querystring = require('querystring');

// req
let fullUrl          = '';
let baseUrl          = '';
let quality          = '';
let file             = '';
let parts            = 10;
let isStream         = false;
let setCustomBaseUrl = true;

// cfg
let m3u8cfg;
let m3u8cfgUpd;
let getM3u8Sheet;

// start
getStream();

// program
async function getStream(){
    
    fullUrl = await shlp.question(`m3u8 video url`);
    getM3u8Sheet = await getData(fullUrl);
    
    if(!getM3u8Sheet.err || getM3u8Sheet.err){
        m3u8cfg = m3u8(getM3u8Sheet.res.body);
        if(m3u8cfg.segments && m3u8cfg.segments.length>0){
            await dlStream(m3u8cfg,fullUrl);
        }
        else if(m3u8cfg.playlists){
            if(m3u8cfg.mediaGroups && m3u8cfg.mediaGroups.AUDIO){
                let audioArr  = m3u8cfg.mediaGroups.AUDIO;
                let audioKeys = Object.keys(audioArr);
                let audioArrMainKey = audioKeys[0];
                audioArr  = m3u8cfg.mediaGroups.AUDIO[audioArrMainKey];
                audioKeys = Object.keys(audioArr);
                for(let a in audioKeys){
                    m3u8cfg.playlists.push(audioArr[audioKeys[a]]);
                }
            }
            for(let v in m3u8cfg.playlists){
                let plEl = m3u8cfg.playlists[v];
                let plAt = plEl.attributes ? plEl.attributes : {};
                let resolution = plAt.RESOLUTION ? `${plAt.RESOLUTION.width}x${plAt.RESOLUTION.height}` : `????x????`;
                let BANDWIDTH  = plAt.BANDWIDTH  ? Math.round(plAt.BANDWIDTH/1024) : `????`;
                console.log(
                    `[${v}] ${resolution} (${BANDWIDTH}KiB/s)`,
                    '\n `-'+m3u8cfg.playlists[v].uri
                );
            }
            quality = await shlp.question(`stream number`);
            try{
                plUri = m3u8cfg.playlists[quality].uri;
                fullUrl = (!plUri.match(/^http/) ? genBaseUrl(fullUrl) : '') + plUri;
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
            catch(e){}
        }
        else{
            console.log(m3u8cfg);
        }
    }
    else{
        console.log(JSON.stringify(getM3u8Sheet,null,'\t'));
    }
    
}

function genBaseUrl(fullUrl){
    return fullUrl.replace(fullUrl.split('/')[fullUrl.split('/').length-1],'');
}

// dl
async function dlStream(m3u8cfg,fullUrl){
    process.chdir(`${__dirname}/downloads/`);
    file = file == '' ? await shlp.question(`ts filename`) : file;
    if (!isStream) {
        isStream = (['Y', 'y'].includes(await shlp.question(`is stream [y/N]`))) ? true : false;
    }
    if(setCustomBaseUrl){
        setCustomBaseUrl = false;
        if(['Y', 'y'].includes(await shlp.question(`do you want enter custom base url [y/N]`))){
            baseUrl  = querystring.parse('url='+(await shlp.question(`base url`)))['url'];
        }
        else{
            baseUrl  = genBaseUrl(fullUrl)
        }
    }
    else{
        baseUrl  = baseUrl;
    }
    let mystream = await hlsdl({ 
        fn: file,
        baseurl: baseUrl, 
        m3u8json: m3u8cfg, 
        pcount: parts, 
        rcount: 100, 
        typeStream: isStream
    });
    console.log(mystream);
    if(isStream){
        await updateStream(m3u8cfg,fullUrl);
    }
}
async function updateStream(m3u8cfg,fullUrl){
    while (true) {
        getM3u8Sheet = await getData(fullUrl);
        m3u8cfgUpd = m3u8(getM3u8Sheet.res.body);
        if (m3u8cfgUpd == m3u8cfg) {
            await delay(2000);
            continue;
        }
        let oldUrls = {};
        m3u8cfg.segments.forEach(s => oldUrls[s.uri] = 1);
        m3u8cfg = m3u8cfgUpd;
        m3u8cfg.segments = m3u8cfg.segments.filter(s => !(s.uri in oldUrls[s.uri]));
        await dlStream(m3u8cfg,fullUrl);
    }
}
function delay(s) {
    return new Promise(resolve => setTimeout(resolve, s));
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