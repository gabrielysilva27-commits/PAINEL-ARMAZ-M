const test=require('node:test'),assert=require('node:assert/strict');
const {shouldScan}=require('../lib/efd-sync');
test('PCD intraday scans wait a full hour and permit explicit diagnostics',()=>{
 const now=Date.parse('2026-11-10T15:00:00-03:00');
 assert.equal(shouldScan({last_scan_at:new Date(now-59*60000).toISOString()},now),false);
 assert.equal(shouldScan({last_scan_at:new Date(now-60*60000).toISOString()},now),true);
 assert.equal(shouldScan({last_scan_at:new Date(now-5*60000).toISOString(),diagnostic_requested:true},now),true);
});
test('the first scan of a new operational day remains available',()=>{
 assert.equal(shouldScan({last_scan_at:'2026-11-10T02:50:00Z'},Date.parse('2026-11-10T03:01:00Z')),true);
});
