#!/usr/bin/env node

// build-in
const fs = require('fs');
const path = require('path');

// extra
const shlp = require('sei-helper');
const { ttml2srt } = require('ttml2srt');
const cfg = require(path.join(__dirname,'/config.json'));

// start
getStream();

// program
async function getStream(){
    let xmlUrl  = await shlp.question(`[Q] ttml file`);
    try{
        let f = fs.readFileSync(xmlUrl, 'utf8');
        let s = ttml2srt(f);
        fs.writeFileSync(xmlUrl+'.srt', s);
    }
    catch(e){
        console.log(e);
    }
}
