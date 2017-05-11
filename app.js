console.log('Starting ...');
var startTime=new Date().getTime();

function startupMode(){                                                   console.log('startupMode()...',new Date().getTime()-startTime);//test
    var app_params = process.argv.slice(2);
    if(app_params.length===0) return 'production';
    return app_params[0];
}

module.exports.startupMode = startupMode;

var fs = require('fs');                                                console.log('fs...',new Date().getTime()-startTime);//test
var express = require('express');                                      console.log('express...',new Date().getTime()-startTime);//test

//var app = require('express').createServer();
var port=8080;
var path=require ('path');                                              console.log('path...',new Date().getTime()-startTime);//test
var bodyParser = require('body-parser');                                console.log('body-parser...',new Date().getTime()-startTime);//test
var cookieParser = require('cookie-parser');                            console.log('cookie-parser...',new Date().getTime()-startTime);//test
//const uuidV1 = require('uuid/v1');                                      console.log('uuid/v1...');//test
var request = require('request');                                       console.log('request...',new Date().getTime()-startTime);//test
var Buffer = require('buffer').Buffer;                                  console.log('buffer...',new Date().getTime()-startTime);//test
var iconv_lite = require('iconv-lite');                                 console.log('iconv-lite...',new Date().getTime()-startTime);//test
var parseString = require('xml2js').parseString;                        console.log('xml2js...',new Date().getTime()-startTime);//test
//var parser = require('xml2json');                                       console.log('xml2json...');//test

var app = express();
var server = require('http').Server(app);                               console.log('http...',new Date().getTime()-startTime);//test
var io = require('socket.io')(server);                                  console.log('socket.io...',new Date().getTime()-startTime);//test

//var Excel = require('exceljs');
//var options = {
//    filename: './products_name.xlsx',
//    useStyles: true,
//    useSharedStrings: true
//};
//var workbook = new Excel.stream.xlsx.WorkbookWriter(options);
//var sheet = workbook.addWorksheet('My Sheet', {properties:{tabColor:{argb:'FFC0000'}}});
//sheet.columns = [
//    { header: 'product', key: 'product', width: 150 },
//];

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use('/',express.static('public'));
var database = require('./dataBase');                                                console.log('./dataBase...',new Date().getTime()-startTime);//test
var ConfigurationError, DBConnectError;


tryLoadConfiguration();
function tryLoadConfiguration(){                                                    console.log('tryLoadConfiguration...',new Date().getTime()-startTime);//test
    try {
        database.loadConfig();
        ConfigurationError=null;
    } catch (e) {
        ConfigurationError= "Failed to load configuration! Reason:"+e;
    }
}
 if (!ConfigurationError) tryDBConnect();
function tryDBConnect(postaction) {                                                   console.log('tryDBConnect...',new Date().getTime()-startTime);//test
    database.databaseConnection(function (err) {
        DBConnectError = null;
        if (err) {
            DBConnectError = "Failed to connect to database! Reason:" + err;
        }
        if (postaction)postaction(err);                                                console.log('tryDBConnect DBConnectError=',DBConnectError);//test
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

                var textLengthStr=xmlText.length+"";
                io.emit('ask_for_data');
                var cashserver_url=database.getDBConfig()['cashserver.url'];
                var cashserver_port=database.getDBConfig()['cashserver.port'];
                request.post({
                    headers: {'Content-Type' : 'text/xml;charset=windows-1251','Content-Length' : textLengthStr},
                    //uri:'http://5.53.113.251:12702/lsoft',
                    uri:'http://'+cashserver_url+':'+cashserver_port+'/lsoft',
                    body: xmlText,
                    encoding: 'binary'
                }, function(error, response, body){         //console.log("body=", body);
                    io.emit('xml_received');

                    var buf = new Buffer(body, 'binary');
                    var  str = iconv_lite.decode(buf, 'win1251');
                    body = iconv_lite.encode (str, 'utf8');

                    io.emit('xml_to_json');

                    parseString(body, function (err, result) {
                        var outData = {};
                        if(err) {       console.log(err);
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

                                var docList = cashBoxList[fn].DAT;                  //list of

                                for (var i in docList) {
                                    var listItem = docList[i];
                                    if(listItem.Z)listItem.isZReport=true;                //check.Z - Z-отчет
                                    else if(listItem.C[0].$.T=='0')listItem.isSale=true;
                                    else if(listItem.C[0].$.T=='1')listItem.isReturn=true;
                                    else if(listItem.C[0].$.T=='2')listItem.isInner=true;

                                    if(listItem.isSale) {
                                        var check={};
                                        check.checkDataID = listItem.$.DI;                   //DAT ID
                                        check.ITN= listItem.$.TN;                   //ИНН
                                        check.dataVersion= listItem.$.V;           // Версия формата пакета данных
                                        check.cashBoxFabricNum = listItem.$.ZN;
                                        check.dataFormDate = listItem.TS[0];

                                        var goodsList = listItem.C[0].P;
                                        check.productsInCheck = [];

                                        check.checkNumber = "1111" + listItem.C[0].E[0].$.NO;
                                        check.totalCheckSum = listItem.C[0].E[0].$.SM;
                                        check.operatorID = listItem.C[0].E[0].$.CS;

                                        check.fixalNumPPO = listItem.C[0].E[0].$.FN;
                                        check.checkDate = listItem.C[0].E[0].$.TS;

                                        if (listItem.C[0].E[0].TX) {                                       //если налогов несколько может не использоваться
                                            var taxInfo = listItem.C[0].E[0].TX[0].$;
                                            if (taxInfo.DTNM) check.AddTaxName = taxInfo.DTNM;
                                            if (taxInfo.DTPR) check.AddTaxRate = taxInfo.DTPR;
                                            if (taxInfo.DTSM) check.AddTaxSum = taxInfo.DTSM;
                                            if (taxInfo.TX) check.taxMark = taxInfo.TX;
                                            if (taxInfo.TXPR) check.taxRate = taxInfo.TXPR;
                                            if (taxInfo.TXSM) check.taxSum = taxInfo.TXSM;
                                            if (taxInfo.TXTY) check.isTaxIncluded = taxInfo.TXTY;       //"0"-включ в стоимость, "1" - не включ.
                                        }

                                        var payment = listItem.C[0].M[0].$;
                                        check.buyerPaymentSum = payment.SM;
                                        check.paymentName = payment.NM;
                                        check.paymentType = payment.T;                               //"0" - нал. не "0" - безнал
                                        if (payment.RM) check.change = payment.RM;

                                        for (var pos in goodsList) {
                                            var product = {};
                                            product.posNumber = goodsList[pos].$.N;
                                            product.name = goodsList[pos].$.NM;
                                            product.qty = goodsList[pos].$.Q;
                                            product.price = goodsList[pos].$.PRC;
                                            product.code = goodsList[pos].$.C;
                                            product.taxMark = goodsList[pos].$.TX;
                                            check.productsInCheck.push(product);
                                            //sheet.addRow({product: product.name}).commit();
                                        }
                                        io.emit('json_ready', check);

                                        var f = function (check) {                                  //console.log("check.checkNumber 241", check.checkNumber);
                                            database.isSaleExists(check, function (err, res) {      //console.log("check.checkNumber 242", check.checkNumber);
                                                                                                   // console.log("res.data.checkNumber 243=" + res.data.checkNumber);
                                                if (err)                                           console.log("APP database.isSaleExists ERROR=", err);
                                                if (!res.empty)                      console.log("Чек существует в базе " + res.data.checkNumber);
                                                if (res.empty) {
                                                                                    console.log("Номер чека до database.addToT_Sale=" + res.data.checkNumber);
                                                    database.addToT_Sale(res.data, function (err, result) {
                                                        if (err)                                  console.log("APP database.addToT_Sale ERROR=", err);

                                                    });
                                                }
                                            });
                                        };
                                        f(check);
                                    };
                                }
                                }
                        //   }
                        //sheet.commit();
                        //workbook.commit();
                        io.emit('data_processed_suc');
                        //  res.send(outData);
                        res.end();
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
    console.log("server runs on port "+ port, "  ",new Date().getTime()-startTime);
});

console.log("end app",new Date().getTime()-startTime);


