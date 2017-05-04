function startupMode(){
    var app_params = process.argv.slice(2);
    if(app_params.length===0) return 'production';
    return app_params[0];
}

module.exports.startupMode = startupMode;

var fs = require('fs');
var express = require('express');

//var app = require('express').createServer();
var port=8080;
var path=require ('path');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const uuidV1 = require('uuid/v1');
var request = require('request');
var Buffer = require('buffer').Buffer;
var iconv_lite = require('iconv-lite');
var parseString = require('xml2js').parseString;
var parser = require('xml2json');

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use('/',express.static('public'));
var database = require('./dataBase');
var ConfigurationError, DBConnectError;


tryLoadConfiguration();
function tryLoadConfiguration(){
    try {
        database.loadConfig();
        ConfigurationError=null;
    } catch (e) {
        ConfigurationError= "Failed to load configuration! Reason:"+e;
    }
}
 if (!ConfigurationError) tryDBConnect();
function tryDBConnect(postaction) {
    database.databaseConnection(function (err) {
        DBConnectError = null;
        if (err) {
            DBConnectError = "Failed to connect to database! Reason:" + err;
        }
        if (postaction)postaction(err);
    });
}


app.get("/sysadmin", function(req, res){
    res.sendFile(path.join(__dirname, '/views', 'sysadmin.html'));
});
app.get("/sysadmin/app_state", function(req, res){
    var outData= {};
    outData.mode= startupMode();
    if (ConfigurationError) {
        outData.error= ConfigurationError;
        res.send(outData);
        return;
    }
    outData.configuration= database.getDBConfig();
    if (DBConnectError)
        outData.dbConnection= DBConnectError;
    else
        outData.dbConnection='Connected';
    res.send(outData);
});
app.get("/sysadmin/startup_parameters", function (req, res) {
    res.sendFile(path.join(__dirname, '/views/sysadmin', 'startup_parameters.html'));
});
app.get("/sysadmin/startup_parameters/get_app_config", function (req, res) {
    if (ConfigurationError) {
        res.send({error:ConfigurationError});
        return;
    }
    res.send(database.getDBConfig());
});
app.get("/sysadmin/startup_parameters/load_app_config", function (req, res) {
    tryLoadConfiguration();
    if (ConfigurationError) {
        res.send({error:ConfigurationError});
        return;
    }
    res.send(database.getDBConfig());
});
app.post("/sysadmin/startup_parameters/store_app_config_and_reconnect", function (req, res) {
    var newDBConfigString = req.body;
    database.setDBConfig(newDBConfigString);
    database.saveConfig(
        function (err) {
            var outData = {};
            if (err) outData.error = err;
            tryDBConnect(/*postaction*/function (err) {
                if (DBConnectError) outData.DBConnectError = DBConnectError;
                res.send(outData);
            });
        }
    );
});
app.get("/sysadmin/import_sales", function (req, res) {
    res.sendFile(path.join(__dirname, '/views/sysadmin', 'import_sales.html'));
});
app.get("/sysadmin/import_sales/get_all_cashboxes", function (req, res) {
 database.getAllCashBoxes(function (err,result) {
           var outData = {};
            if (err) outData.error = err.message;
            outData.items = result;
            outData.success = "ok";
            res.send(outData);
        });
});
app.get("/sysadmin/import_sales/get_sales", function (req, res) {
    var sCashBoxesList = getCashBoxesList(req);
    var bdate = req.query.bdate;
    var edate = req.query.edate;

        database.createXMLSalesRequest(bdate, edate, sCashBoxesList,
            function (error) {
                res.send({error: ""});
            }, function (recordset) {
                var xmlText="";
                for(var i in recordset) {
                    var xmlLine=recordset[i].XMLText;
                    xmlText=xmlText+xmlLine;
                }

                var textLengthStr=xmlText.length+"";             console.log("xmlText=",xmlText);
                var request = require('request');
                io.emit('ask_for_data');
                var cashserver_url=database.getDBConfig()['cashserver.url'];
                var cashserver_port=database.getDBConfig()['cashserver.port'];
                request.post({
                    headers: {'Content-Type' : 'text/xml;charset=windows-1251','Content-Length' : textLengthStr},
                    //uri:'http://5.53.113.251:12702/lsoft',
                    uri:'http://'+cashserver_url+':'+cashserver_port+'/lsoft',
                    body: xmlText,
                    encoding: 'binary'
                }, function(error, response, body){                           //  console.log("response=", body);
                    io.emit('xml_received');

                    var buf = new Buffer(body, 'binary');
                    var  str = iconv_lite.decode(buf, 'win1251');
                    body = iconv_lite.encode (str, 'utf8');

                    io.emit('xml_to_json');

                    parseString(body, function (err, result) {                   console.log("result=",result);
                        var outData = {};
                        if(err) {
                            console.log(err);
                            return;
                        }
                        if(!result.gw_srv_rsp.select){
                            outData.error=result.gw_srv_rsp;
                               io.emit('response_error', outData);
                            res.send(outData);
                            return;
                        }
                            var cashBoxList = result.gw_srv_rsp.select[0].FISC[0].EJ;
                            for (var fn in cashBoxList) {
                                var cashBox=cashBoxList[fn];
                                var cashBoxID=cashBox.$.ID;
                                io.emit('cash_box_id', cashBoxID);
                                var checkList = cashBoxList[fn].DAT;
                                for (var i in checkList) {
                                    var check = checkList[i];
                                    var checkNumber = check.$.DI;
                                    var checkCashBox = check.$.ZN;
                                    var checkDate = check.TS[0];
                                                                      //check.Z - Z-отчет

                                    if(check.Z)check.isZReport=true;
                                    else if(check.C[0].$.T=='0')check.isSale=true;
                                    else if(check.C[0].$.T=='1')check.isReturn=true;
                                    else if(check.C[0].$.T=='2')check.isInner=true;

                                    if(check.isSale) {
                                        var goodsList=check.C[0].P;
                                        outData.productsInCheck=[];

                                        for(var pos in goodsList){
                                            var product={};
                                            product.posNumber=goodsList[pos].$.N;
                                            product.name=goodsList[pos].$.NM;
                                            product.qty=goodsList[pos].$.Q;
                                            product.price=goodsList[pos].$.PRC;
                                            outData.productsInCheck.push(product);
                                        }
                                        outData.checkNumber = checkNumber;
                                        outData.checkDate = checkDate;
                                        outData.checkCashBox = checkCashBox;
                                        io.emit('json_ready', outData);
                                    }
                                }
                            }
                            io.emit('data_processed_suc');
                        //database.addToT_Sale(outData, function(err,result){
                        console.log("routData.checkNumber=",outData.checkNumber);
                        console.log("checkDate=",checkDate);
                        database.isSaleExists(outData.checkNumber,outData.checkCashBox, function(err,res){

                            if(err) console.log("err=",err);
                            if(res.empty){                                    //длина ответа

                            }

                        });

                        //database.getAllCashBoxes(function (err,result) {
                        //    var outData = {};
                        //    if (err) outData.error = err.message;
                        //    outData.items = result;
                        //    outData.success = "ok";
                        //    res.send(outData);
                        //});

                            res.send(outData);
                    });
                });

            });
    });


function getCashBoxesList(req){
    var sCashBoxesList="";
    for(var itemName in req.query){
        if (itemName.indexOf("cashbox_")>=0){
            sCashBoxesList=sCashBoxesList+","+req.query[itemName]+",";
        }
    }
    return sCashBoxesList;
}

//io.on('connection', function (socket) {
//    socket.emit('news', { hello: 'world' });
//    socket.on('my other event', function (data) {
//        console.log(data);
//    });
//});

server.listen(port, function (err) {
    console.log("server runs on port "+ port);
});




