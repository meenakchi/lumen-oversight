#!/usr/bin/env node
'use strict';
const i = require('../engine/integrity');
const c = i.chainBuild();
console.log('chain built over', c.count, 'entries, head', c.head.slice(0, 12));
