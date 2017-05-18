var fs = require('fs');
var sql = require('mssql');
var app = require('./app');
var dbConfig;
var dbConfigFilePath;
var conn=null;

module.exports.getDBConfig=function(){
    return dbConfig;
};
module.exports.setDBConfig=function(newDBConfig){
    dbConfig= newDBConfig;
};
module.exports.loadConfig=function(){
    dbConfigFilePath='./' + app.startupMode + '.cfg';
    var stringConfig = fs.readFileSync(dbConfigFilePath);
    dbConfig = JSON.parse(stringConfig);
};
module.exports.saveConfig=function(callback) {
    fs.writeFile(dbConfigFilePath, JSON.stringify(dbConfig), function (err, success) {
        callback(err,success);
    })
};
module.exports.databaseConnection=function(callback){
    if(conn) conn.close();
    conn = new sql.Connection(dbConfig);
    conn.connect(function (err) {
        if (err) {
            callback(err.message);
            return;
        }
        callback(null,"connected");
    });
};

module.exports.setConfirmedOrderInfo = function (ChID, name, tel, email, callback) {
    var textInfo = "name:"+ name+",tel:"+tel+",email:"+email;
    var reqSql = new sql.Request(conn);
    var query_str = fs.readFileSync('./scripts/mobile_confirmed_order_info.sql', 'utf8');

    reqSql.input('ChID',sql.Int, ChID);
    reqSql.input('OrderInfo',sql.NVarChar, textInfo);

    reqSql.query(query_str,
        function (err,recordset) {
            if (err) {
                callback(err, null);
            }
            else {
                callback(null, recordset);
            }
        });
};

module.exports.getAllCashBoxes= function(callback) {
    var reqSql = new sql.Request(conn);
    var query_str='SELECT * FROM r_Crs WHERE CRID>0 AND CashType=8 ';
    reqSql.query(query_str,
        function (err, recordset) {
            if (err) {
                callback(err);
            } else {
               callback(null,recordset);
        }
        }
    );
};

module.exports.getXMLForUniCashServerRequest = function (bdate, edate, cashBoxesID, callback) {
    var reqSql = new sql.Request(conn);
    var query_str = fs.readFileSync('./scripts/sales_report.sql', 'utf8');
    reqSql.input('BDATE', sql.NVarChar, bdate);
    reqSql.input('EDATE', sql.NVarChar, edate);
    reqSql.input('CRIDLIST', sql.NVarChar, cashBoxesID);
    reqSql.query(query_str,
        function (err, recordset) {
            if (err) {
                callback(err);
            } else {
                callback(null,recordset);
            }
        })
};

function isPaymentExist(CHID, callback){
    var reqSql = new sql.Request(conn);
    reqSql.input('CHID', sql.NVarChar, CHID);
    reqSql.query("select ChID from t_SalePays WHERE ChID=@CHID",
        function (err, recordset) {
            var outData={};
            if (err) {
                callback(err);
                return;
            }
            if(recordset[0]) {
                outData.exist=true;
                callback(null, outData);
                return;
            }
            callback(null, "not exist");
        })
}

function addToSalePays (CHID,cheque,callback){

    var buyerPaymentSum=cheque.buyerPaymentSum;
    var change=cheque.change;
    var PayFormCode =detectPaymentForm(cheque.paymentType);
    var reqSql = new sql.Request(conn);
    var query_str = fs.readFileSync('./scripts/add_to_salepays.sql', 'utf8');
    reqSql.input('CHID', sql.NVarChar, CHID);
    reqSql.input('PayFormCode', sql.NVarChar, PayFormCode);
    reqSql.input('SumCC_wt', sql.NVarChar, buyerPaymentSum);

    reqSql.query(query_str,
        function (err, recordset) {
            if (err) {
                callback(err);
            } else {
                if(change){
                    var reqSql = new sql.Request(conn);
                    var query_str = fs.readFileSync('./scripts/add_to_salePays', 'utf8');
                    reqSql.input('CHID', sql.NVarChar, CHID);
                    reqSql.input('PayFormCode', sql.NVarChar, PayFormCode);
                    reqSql.input('SumCC_wt', sql.NVarChar, buyerPaymentSum);
                    reqSql.input('SumCC_wt', sql.NVarChar, '-'+change);
                    reqSql.query(query_str,
                        function (err, recordset) {
                            if (err) {
                                callback(err);
                            } else {
                                callback(null,CHID);
                            }
                        })
                };
            }
            callback(null,CHID);
        })
};

function deletePayment(ChID, callback){
    var reqSql = new sql.Request(conn);
    reqSql.input('CHID', sql.NVarChar, ChID);
    reqSql.query("DELETE from t_SalePays WHERE ChID=@CHID",
        function (err, recordset) {
            if (err) {
                callback(err);
                return;
            }
            callback(null, "deleted");
        })
}

module.exports.fillToSalePays = function (CHID, cheque, callback) {
    isPaymentExist(CHID, function (err, res) {
        var outData={};
        if (err) {
            callback(err);
            return;
        }
        if (res.exist) {
            outData.exist=true;
            deletePayment(CHID, function (err, res) {
                if (err) {
                    callback(err);
                    return;
                }
            });
        }
        addToSalePays(CHID, cheque, function (err, res) {
            if (err) {
                callback(err);
                return;
            }
            updateSaleStatus(CHID, function (err, res) {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null,outData);
            })
        })
    })
};


function updateSaleStatus (CHID, callback){

    var reqSql = new sql.Request(conn);
  //  var query_str = fs.readFileSync('./scripts/add_to_salepays.sql', 'utf8');
    reqSql.input('CHID', sql.NVarChar, CHID);

    reqSql.query('UPDATE t_Sale SET StateCode=22 WHERE CHID=@CHID',
        function (err, recordset) {
            if (err) {
                callback(err);
             return;
            }
            callback(null, "updated");
        })
};

function isSaleExists(DOCID,callback){
    var reqSql = new sql.Request(conn);
    reqSql.input('DOCID', sql.Int, DOCID);
    reqSql.query('select ChID from t_Sale WHERE DOCID=@DOCID',
        function (err, recordset) {
            var outData={};
            if (err) {
                callback(err);
                return;
            }
            if(recordset[0]){
                outData.ChID=recordset[0].ChID;
                outData.exist=true;
                callback(null, outData);
                return;
            }
                callback(null,"notExist");
        })
}

function addToSale(data, callback){
    try {
        var FacID = data.cashBoxFabricNum;
        var FacIDNum = FacID.replace("ПБ", "");
        var date = formatDate(data.checkDate);
        var reqSql = new sql.Request(conn);
        var queryString = fs.readFileSync('./scripts/add_to_sale.sql', 'utf8');
    }catch(e){
        callback(e);
        return;
    }
    reqSql.input('DocID', sql.NVarChar, data.checkNumber);
    reqSql.input('DocDate', sql.NVarChar, date);
    reqSql.input('OperID', sql.NVarChar, data.operatorID);
    reqSql.input('DocTime', sql.NVarChar, date);
    reqSql.input('CashSumCC', sql.NVarChar, data.buyerPaymentSum);
    reqSql.input('FacID', sql.NVarChar,FacIDNum);
    reqSql.input('DocCreateTime', sql.NVarChar, date);
    if (data.change) reqSql.input('ChangeSumCC', sql.NVarChar, data.change);
    else reqSql.input('ChangeSumCC', sql.NVarChar, 0);

    reqSql.query(queryString,
        function (err,recordset) {
            var outData={};
            if (err) {
                callback(err, null);
                return;
            }
            outData.ChID=recordset[0].ChID;
            outData.created=true;
            callback(null, outData);
        });
}

module.exports.fillChequeTitle = function(chequeData, callback) {

    var chequeNum = chequeData.checkNumber;
    isSaleExists(chequeNum, function (err, res) {
        if (err) {
            callback(err);
            return;
        }
        if (res.exist) {
            callback(null, res);
            return;
        }

        addToSale(chequeData, function (err, res) {
            if (err) {
                callback(err);
                return;
            }
            callback(null,res);
        })
    });
};

function isPosExists(ChID, posNum, callback){
    var reqSql = new sql.Request(conn);
    reqSql.input('ChID', sql.NVarChar, ChID);
    reqSql.input('SrcPosID', sql.NVarChar, posNum);
    reqSql.query('select ChID,SrcPosID  from t_SaleD WHERE ChID=@ChID AND SrcPosID=@SrcPosID',
        function (err, recordset) {
            var outData={};
            if (err) {
                callback(err);
                return;
            }
            if(recordset[0]){
                outData.ChID=recordset[0].ChID;
                outData.SrcPosID=recordset[0].SrcPosID;
                outData.exist=true;
                callback(null, outData);
                return;
            }
            callback(null,"notExist");
        })
}

function addToSaleD(ChID, chequeData, chequeProdData, callback) {
    var date = formatDate(chequeData.checkDate);
    var PriceCC_nt = chequeProdData.price / 1.2;
    var Qty = chequeProdData.qty;
    var SumCC_nt = PriceCC_nt * Qty;
    var Tax = chequeProdData.price - PriceCC_nt;
    var TaxSum = Tax * Qty;
    var reqSql = new sql.Request(conn);
    reqSql.input('ChID', sql.NVarChar, ChID);
    reqSql.input('SrcPosID', sql.NVarChar, chequeProdData.posNumber);
    reqSql.input('Article2', sql.NVarChar, chequeProdData.name);
    reqSql.input('Qty', sql.NVarChar, Qty);
    reqSql.input('PriceCC_nt', sql.NVarChar, PriceCC_nt);
    reqSql.input('SumCC_nt', sql.NVarChar, SumCC_nt);
    reqSql.input('Tax', sql.NVarChar, Tax);
    reqSql.input('TaxSum', sql.NVarChar, TaxSum);
    reqSql.input('PriceCC_wt', sql.NVarChar, chequeProdData.price);
    reqSql.input('SumCC_wt', sql.NVarChar, chequeProdData.price * Qty);
    reqSql.input('PurPriceCC_nt', sql.NVarChar, PriceCC_nt);
    reqSql.input('PurTax', sql.NVarChar, Tax);
    reqSql.input('PurPriceCC_wt', sql.NVarChar, chequeProdData.price);
    reqSql.input('CreateTime', sql.NVarChar, date);
    reqSql.input('ModifyTime', sql.NVarChar, date);
    reqSql.input('RealPrice', sql.NVarChar, chequeProdData.price);
    reqSql.input('RealSum', sql.NVarChar, chequeProdData.price * Qty);
    reqSql.input('OperID', sql.NVarChar, chequeData.operatorID);

    reqSql.query('select ProdID from r_Prods where Article2=@Article2',
        function (err, recordset) {
            var outData={};
            if (err) {
                callback(err, null);
                return;
            }
            if (!recordset[0]) {
                outData.notFoundProd="Не удалось внести позицию! Наименование " + chequeProdData.name + " не найдено в базе";
                callback(null, outData);
                return;
            }
            var queryString = fs.readFileSync('./scripts/add_to_saleD.sql', 'utf8');
            reqSql.query(queryString,
                function (err) {
                    if (err) {
                        callback(err, null);
                        return;
                    }
                    outData.ChID=ChID
                    callback(null,outData);
                });
        });
}

module.exports.fillChequeProds = function(saleChID,chequeData, chequeProdData, callback) {

    var posNum = chequeProdData.posNumber;
    isPosExists(saleChID,posNum, function (err, res) {
        if (err) {
            callback(err);
            return;
        }
        if (res.exist) {
            callback(null, res);
            return;
        }

        addToSaleD(saleChID,chequeData, chequeProdData, function (err, res) {
            if (err) {
                callback(err);
                return;
            }
            callback(null,res);
        })
    });
};

module.exports.logToDB = function(Msg,FacID, callback) {
    var reqSql = new sql.Request(conn);
    var CRID;
    if(!FacID){
        CRID=0;
        reqSql.input('CRID', sql.NVarChar, CRID);
        reqSql.input('Msg', sql.NVarChar, Msg);
        var queryString = fs.readFileSync('./scripts/add_log_to_DB.sql', 'utf8');
        reqSql.query(queryString,
            function (err, recordset) {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null,"ок");
            })
    }else{
        var FacIDFormatted=FacID.replace("ПБ","");
        reqSql.input('FacID', sql.NVarChar, FacIDFormatted);
        reqSql.query('select  CRID from r_Crs WHERE FacID=@FacID;',
            function (err, recordset) {
                if (err) {
                    callback(err);
                    return;
                }
                if(!(recordset && recordset[0])){
                    callback("Не удалось определить ID кассового аппарата");
                }
                CRID=recordset[0].CRID;
                reqSql.input('CRID', sql.NVarChar, CRID);
                reqSql.input('Msg', sql.NVarChar, Msg);
                var queryString = fs.readFileSync('./scripts/add_log_to_DB.sql', 'utf8');
                reqSql.query(queryString,
                    function (err, recordset) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        callback(null,"ок");
                    })
            })
    }

};


function formatDate(date){
    var dch = date.split("");
    var newDateFormat = dch[0] + dch[1] + dch[2] + dch[3] + "-" + dch[4] + dch[5] + "-" + dch[6] + dch[7] + " " + dch[8] + dch[9] + ":" + dch[10] + dch[11] + ":" + dch[12] + dch[13];
    return newDateFormat;
}

function detectPaymentForm(PaymentForm){
    return  PaymentForm == '0' ? 1 : 2;
}

/*
 * { checkDataID: '17712',
 ITN: 'ПН 000036837328',
 dataVersion: '1',
 cashBoxFabricNum: 'ПБ4101213753',
 dataFormDate: '20170413094128',
 productsInCheck:
 [ { posNumber: '1',
 name: 'Медовуха майс.0,2л',
 qty: '2000',
 price: '3000',
 code: '45',
 taxMark: '1' } ],
 checkNumber: '111114093',
 totalCheckSum: '6000',
 operatorID: '1',
 fixalNumPPO: '3000101755',
 checkDate: '20170413094128',
 AddTaxName: 'АКЦИЗ 5 ВІДС.',
 AddTaxRate: '6.00',
 AddTaxSum: '286',
 taxMark: '1',
 taxRate: '20.00',
 taxSum: '952',
 isTaxIncluded: '0',
 buyerPaymentSum: '6000',
 paymentName: 'ГОТІВКА',
 paymentType: '0' }
 product.taxMark= 1*/

















