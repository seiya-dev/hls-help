#!/usr/bin/env node

// build-in
const fs = require('fs');

// modules
const got = require('got').extend({
    headers: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:65.0) Gecko/20100101 Firefox/65.0' },
});

// extra
const shlp = require('sei-helper');
const { ttml2srt } = require('ttml2srt');

// start
getStream();

// program
async function getStream(){
    let xmlUrl  = await shlp.question(`[Q] ttml url`);
    let file    = await shlp.question(`[Q] srt filename`);
    let xmlData = await getData(xmlUrl);
    if(xmlData.ok){
        let xmlBody = xmlData.res.body;
        process.chdir(`${__dirname}/downloads/`);
        fs.writeFileSync(file+'.srt',ttml2srt(xmlBody));
    }
}

// request
function getData(options){
    try {
        let res = await got(options);
        return {
            ok: true,
            res
        };
    }
    catch(error){
        if(error.statusCode && error.statusMessage){
            console.log(`[ERROR] ${error.name} ${error.statusCode}: ${error.statusMessage}`);
        }
        else{
            console.log(`[ERROR] ${error.name}: ${error.code}`);
        }
        return {
            ok: false,
            error
        };
    }
}
