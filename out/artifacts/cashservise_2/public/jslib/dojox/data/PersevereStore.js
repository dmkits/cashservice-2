//>>built
define("dojox/data/PersevereStore","dojo dojox require dojox/data/JsonQueryRestStore dojox/rpc/Client dojo/_base/url".split(" "),function(e,d,h){d.json.ref.serializeFunctions=!0;var b=e.declare("dojox.data.PersevereStore",d.data.JsonQueryRestStore,{useFullIdInQueries:!0,jsonQueryPagination:!1});b.getStores=function(a,b){a=a&&(a.match(/\/$/)?a:a+"/")||"/";a.match(/^\w*:\/\//)&&(h("dojox/io/xhrScriptPlugin"),d.io.xhrScriptPlugin(a,"callback",d.io.xhrPlugins.fullHttpAdapter));var l=e.xhr;e.xhr=function(d,
a){(a.headers=a.headers||{})["Server-Methods"]="false";return l.apply(e,arguments)};var f=d.rpc.Rest(a,!0);d.rpc._sync=b;var f=f("Class/"),m,n={},p=0;f.addCallback(function(b){function f(c){!c["extends"]||!c["extends"].prototype||c.prototype&&c.prototype.isPrototypeOf(c["extends"].prototype)||(f(c["extends"]),d.rpc.Rest._index[c.prototype.__id]=c.prototype=e.mixin(e.delegate(c["extends"].prototype),c.prototype))}function h(c,b){if(c&&b)for(var a in c)"client"==c[a].runAt||b[a]||(b[a]=function(b){return function(){var a=
e.rawXhrPost({url:this.__id,postData:d.json.ref.toJson({method:b,id:p++,params:e._toArray(arguments)}),handleAs:"json"});a.addCallback(function(a){return a.error?Error(a.error):a.result});return a}}(a))}d.json.ref.resolveJson(b,{index:d.rpc.Rest._index,idPrefix:"/Class/",assignAbsoluteIds:!0});for(var k in b)if("object"==typeof b[k]){var g=b[k];f(g);h(g.methods,g.prototype=g.prototype||{});h(g.staticMethods,g);n[b[k].id]=new d.data.PersevereStore({target:new e._Url(a,b[k].id)+"/",schema:g})}return m=
n});e.xhr=l;return b?m:f};b.addProxy=function(){h("dojox/io/xhrPlugins");d.io.xhrPlugins.addProxy("/proxy/")};return b});
//# sourceMappingURL=PersevereStore.js.map