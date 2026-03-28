var prevOffenseCode;
function GetSeletedRowCellValue(grid, columnName) {
    var myGrid = $(grid),
        selRowId = myGrid.jqGrid('getGridParam', 'selrow'),
        celValue = myGrid.jqGrid('getCell', selRowId, columnName);
    return celValue;
}

function ReloadBarChart(segment, reportYear, reportType, reportIDs, offensecode, ageclass) {
    var segmentName = segment.toLowerCase();
    var dynamic_barchart = segmentName + "barchart";
    var reportURL = applicationURL + 'Get' + segment + 'forBarChartByYear?reporttype=' + reportType + '&reportids=' + reportIDs + '&reportYear=' + reportYear + '&offensecode=' + offensecode + (segmentName == "arrest" ? "&ageClass=" + ageclass : "");
    $.ajax({
        type: "GET",
        url: reportURL,
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        success: function (data) {
            //var smax = Math.max.apply(null, data.selectedYear);
            //var pmax = Math.max.apply(null, data.previousYear);
            //var max = Math.max(smax, pmax);
            //max = max > 1000 ? max + 1000 : max + 200;
            //var intrval = parseInt((max / 10));
            Highcharts.setOptions({
                lang: {
                    thousandsSep: ','
                }
            });
            var chart = Highcharts.chart(dynamic_barchart, {
                chart: {
                    // height: 'auto',//segmentName == "offense" ? 515 : 455,
                    type: segmentName == "hatecrime" ?'column':'bar',
                    height: segmentName == "offense" ? 515 : 455,
                    
                },
                title: {
                    text: '<span style="font-size: 16px;font-weight:bold;font-family: Arial">' + data.chartHeader + '</span><br/>'
                },
                subtitle: {
                    text: ''
                },
                xAxis: {
                    categories: data.chartList,
                    labels: {
                        style: {
                            fontSize:"10px"
                        }
                    }
                },
                yAxis: {
                    // min: 0, max: max, tickInterval: intrval,
                    title: {
                        text: ''
                    },
                    gridLineWidth: 0,
                    minorGridLineWidth: 0,
                },
                plotOptions: {
                    column: {
                        dataLabels: {
                            enabled: true
                        },
                        enableMouseTracking: false
                    },
                    series: {
                        dataLabels: {
                            enabled: true,
                            align: 'Right',
                        },
                        enableMouseTracking: true
                    }
                },
                credits: {
                    enabled: false
                },
                series: [{
                    name: (reportYear - 1),
                    data: data.previousYear,
                    color: '#c79a2adb' //(segmentName == "hatecrime" ? '#9ACD32' : '#c79a2adb')

                },
                    {
                        name: reportYear,
                        data: data.selectedYear,
                        color: '#008081bd' //(segmentName == "hatecrime" ? '#4169E1' : '#008081bd')

                    }],

            });

        }
    });
}

function ReloadLineChart(segment, reportYear, reportType, reportIDs, offensecode, ageclass, offense) {

    var segmentName = segment.toLowerCase();
    var dynamic_linechart = segmentName + "linechart";
    var dynamic_linechart_month_grid = "#" + segmentName + "monthtable";

    jQuery(function ($) {
        var reportURL = applicationURL + 'Get' + segment + 'forLineChartByMonth?reporttype=' + reportType + '&reportids=' + reportIDs + '&reportYear=' + reportYear + '&offensecode=' + offensecode + (segmentName == "arrest" ? "&ageClass=" + ageclass : "");
        $.ajax({
            type: "GET",
            url: reportURL,
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            success: function (data) {


                //if (segmentName == "offense") {
                var parent_column = $(dynamic_linechart_month_grid).closest('[class*="col-sm-12"]');
                //resize to fit page size
                $(window).on('resize.jqGrid', function () {
                    $(dynamic_linechart_month_grid).jqGrid('setGridWidth', parent_column.width());
                })
                //resize on sidebar collapse/expand
                $(document).on('settings.ace.jqGrid', function (ev, event_name, collapsed) {
                    if (event_name === 'sidebar_collapsed' || event_name === 'main_container_fixed') {
                        //setTimeout is for webkit only to give time for DOM changes and then redraw!!!
                        setTimeout(function () {
                            $(dynamic_linechart_month_grid).jqGrid('setGridWidth', parent_column.width());
                        }, 0);
                    }
                })
                $(dynamic_linechart_month_grid).jqGrid('GridUnload');
                for (var i = 0; i < data.rowsM.length; i++) {
                    cm = data.rowsM[i];
                    if (cm.hasOwnProperty("cellattr") && functionsMappingLine.hasOwnProperty(cm.cellattr))
                        cm.cellattr = functionsMappingLine[cm.cellattr];
                    if (cm.hasOwnProperty("formatter") && functionsMappingLine.hasOwnProperty(cm.formatter))
                        cm.formatter = functionsMappingLine[cm.formatter];
                }
                jQuery(dynamic_linechart_month_grid).jqGrid({
                    url: reportURL,
                    datatype: "json",
                    height: 'auto',
                    width: "100%",
                    colNames: data.rowsHead,
                    colModel: data.rowsM,
                    data: data.rows,
                    postData: {},
                    rowNum: 1000,
                    toppager: false,
                    cloneToTop: true,
                    //sortname: 'PercentageChange',
                    viewrecords: true,
                    //sortorder: 'desc',
                    //autowidth: true,
                    // shrinkToFit :false,
                    loadonce: true,
                    loadComplete: function () {
                        $(window).triggerHandler('resize.jqGrid');
                    }
                });
                //}

                Highcharts.setOptions({
                    lang: {
                        thousandsSep: ','
                    }
                });

                Highcharts.chart(dynamic_linechart, {
                    chart: {
                        type: 'line'
                    },
                    title: {
                        text: '<span style="font-size: 16px;font-weight:bold;font-family: Arial">' + data.chartHeader + (offense.length > 0 ? offense : '') + '</span><br/>'
                    },
                    subtitle: {
                        text: ''
                    },
                    xAxis: {
                        categories: data.chartList
                    },
                    yAxis: {
                        title: {
                            text: ''
                        },
                        gridLineWidth: 0,
                        minorGridLineWidth: 0
                    },
                    plotOptions: {
                        line: {
                            dataLabels: {
                                enabled: true
                            },
                            enableMouseTracking: false
                        },
                        series: {
                            dataLabels: {
                                enabled: true,
                                align: 'Right'
                            },
                            enableMouseTracking: true
                        }
                    },
                    credits: {
                        enabled: false
                    },
                    series: [{
                        name: (reportYear - 1),
                        data: data.previousYear,
                        color: '#c79a2adb'
                    }, {
                            name: reportYear,
                            data: data.selectedYear,
                            color: '#008081bd'

                        }]
                });
            }
        });
    });

    var functionsMappingLine = {
        "cellattributes": function (rowId, tv, rawObject, cm, rdata) {
            var attr = ' style="text-align: right;"';
            var colname = cm.name.replace(" ", "").replace(" ", "").toLowerCase();
            if (colname == "year")
                attr = ' ';

            return attr;
        },
        "cellformater": function (cellvalue, cm, rawObject, row) {
            var CellValue = cellvalue;
            var colname = cm.colModel.name.replace(" ", "").replace(" ", "").toLowerCase();
            if (colname != "year")
                CellValue = cellvalue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            
            return CellValue;
        }
    };
}

function LoadCrimeDahshboard(segment, reportYear, reportType, reportIDs, ageclass) {
    prevOffenseCode = null;
    var segmentName = segment.toLowerCase();
    var dynamic_grid_selector = "#" + segmentName + "table";

    jQuery(function ($) {
        var parent_column = $(dynamic_grid_selector).closest('[class*="col-"]');
        //resize to fit page size
        $(window).on('resize.jqGrid', function () {
            $(dynamic_grid_selector).jqGrid('setGridWidth', parent_column.width());
            if (segmentName == "offense")
                SetOffenseHeader(reportYear, dynamic_grid_selector);
        })
        //resize on sidebar collapse/expand
        $(document).on('settings.ace.jqGrid', function (ev, event_name, collapsed) {
            if (event_name === 'sidebar_collapsed' || event_name === 'main_container_fixed') {
                //setTimeout is for webkit only to give time for DOM changes and then redraw!!!
                setTimeout(function () {
                    $(dynamic_grid_selector).jqGrid('setGridWidth', parent_column.width());
                }, 0);
            }
        })
    });

    jQuery(function ($) {
        var reportURL = applicationURL + 'Get' + segment + 'forGridByYear?reporttype=' + reportType + '&reportids=' + reportIDs + '&reportYear=' + reportYear + '&offensecode=-1' + (segmentName == "arrest" ? "&ageClass=" + ageclass : "");
        $.ajax({
            type: "GET",
            url: reportURL,
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            success: function (data) {
                $(dynamic_grid_selector).jqGrid('GridUnload');
                for (var i = 0; i < data.rowsM.length; i++) {
                    cm = data.rowsM[i];
                    if (cm.hasOwnProperty("cellattr") && functionsMapping.hasOwnProperty(cm.cellattr))
                        cm.cellattr = functionsMapping[cm.cellattr];
                    if (cm.hasOwnProperty("formatter") && functionsMapping.hasOwnProperty(cm.formatter))
                        cm.formatter = functionsMapping[cm.formatter];
                }
                jQuery(dynamic_grid_selector).jqGrid({
                    url: reportURL,
                    datatype: "json",
                    height: 'auto',
                    onSelectRow: function (rowid, isSelected) {
                        var totalrow = GetSeletedRowCellValue(dynamic_grid_selector, segmentName == "stolenproperty" ? "Type" : (segmentName == "hatecrime" ? "Bias Motivation" : "Offenses")); // : "Type"); // Should be refined
                        var offensecode = GetSeletedRowCellValue(dynamic_grid_selector, "OffenseCode");

                        if (prevOffenseCode == offensecode || totalrow.toString().toLocaleLowerCase() == "total" || totalrow.toString().toLocaleLowerCase().indexOf("total") > -1 ) {
                            ReloadBarChart(segment, reportYear, reportType, reportIDs, "-1", ageclass)
                            ReloadLineChart(segment, reportYear, reportType, reportIDs, "-1", ageclass,"")
                            jQuery(dynamic_grid_selector).jqGrid('resetSelection');
                        }
                        else {
                            ReloadBarChart(segment, reportYear, reportType, reportIDs, offensecode, ageclass)
                            ReloadLineChart(segment, reportYear, reportType, reportIDs, offensecode, ageclass, " - " + totalrow)
                        }
                        prevOffenseCode = offensecode;
                    },
                    beforeSelectRow: function (rowid, e) {
                        jQuery(dynamic_grid_selector).jqGrid('resetSelection');
                        return (true);
                    },
                    colNames: data.rowsHead,
                    colModel: data.rowsM,
                    data: data.rows,
                    postData: {},
                    rowNum: 1000,
                    toppager: false,
                    cloneToTop: true,
                    //sortname: 'PercentageChange',
                    viewrecords: true,
                    //sortorder: 'desc',
                    autowidth: true,
                    resizable: false,
                    headertitles: true,
                    loadComplete: function () {
                        $(window).triggerHandler('resize.jqGrid');
                        if (segmentName == "offense") {
                            SetOffenseHeader(reportYear, this);
                            jQuery(dynamic_grid_selector).jqGrid('setSelection', '12');
                        }
                        //ReloadBarChart(segment, reportYear, reportType, reportIDs, "-1", ageclass)
                        //ReloadLineChart(segment, reportYear, reportType, reportIDs, "-1", ageclass)
                    }
                });

            }
        })
    });


    setTimeout(function () {
        $(window).triggerHandler('resize.jqGrid');
    });


var functionsMapping = {
    "cellattributes": function (rowId, tv, rawObject, cm, rdata) {
        var attr = ' style="text-align: right;"';
        var colname = cm.name.replace(" ", "").replace(" ", "").toLowerCase();
        if (colname == "offenses" || colname == "type" || colname == "biasmotivation")
            attr = ' style="white-space: normal;"';
        return attr;
    },
    "cellformater": function (cellvalue, cm, rawObject, row) {
        var CellValue = cellvalue;
        var colname = cm.colModel.name.replace(" ", "").replace(" ", "").toLowerCase();
        if (colname != "offenses" && colname != "type" && colname != "biasmotivation")
            CellValue = cellvalue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if ((cm.gid == "offensetable" && rawObject[2].toLowerCase() == "total") || rawObject[1].toLowerCase() == "total") {
            return "<span style='font-weight:bold'>" + CellValue + "</span>";
        }
        //else if (rawObject[1].toLowerCase() == "total") {
        //    return "<span style='font-weight:bold'>" + cellvalue + "</span>";
        //}
        else
            return CellValue;
    }
    };
}

function SetOffenseHeader(reportyear, grid) {
    var gHeaders = jQuery(grid).jqGrid('getGridParam', 'groupHeader');
    if (gHeaders != "") {
        // destroy previous group headers
        jQuery(grid).jqGrid('destroyGroupHeader');
    }
    // Add group headers
    jQuery(grid).jqGrid('setGroupHeaders', {
        useColSpanStyle: true,
        groupHeaders: [
            { startColumnName: 'Offense Count (A)', numberOfColumns: 3, titleText: reportyear },
            { startColumnName: 'Offense Count (D)', numberOfColumns: 3, titleText: reportyear - 1 }
        ]
    });

}

$(document).ready(function () {
    $("#sidebar-collapse").on("click", function () {
       // setTimeout(function () {
          //  $(window).triggerHandler('resize.jqGrid');
            var scope = angular.element(document.getElementById("ReportYear")).scope();
            scope.$apply(function () {
                scope.SetSegmentAndPopulateData();
            });
       // }, 1000);
    });
})
app.controller('CrimeRateDashboardController', ['$scope', '$rootScope', '$sce', '$http', 'pageMessageService', function ($scope, $rootScope, $sce, $http, pageMessageService) {
    $scope.CrimeRateDashboard = [];
    $scope.TableTitle = "";
    $scope.CrimeDashboardInit = function () {
        $scope.searchentity = { ReportYear: new Date().getFullYear(), AgencyID: ["-1"], CountyID: ["-1"], TagID: ["-1"], ReportType: "Agency", showingSegment: "Offense", PropertySubType: "StolenProperty", AgeClass: "All" };
        $scope.PopulateData('Offense');
    }

    $scope.SetSegmentAndPopulateData = function () {
        $scope.PopulateData($scope.searchentity.showingSegment);
    }
    $scope.PopulateData = function (seg) {

        $scope.searchentity.showingSegment = seg;
        var segment = $scope.searchentity.showingSegment;
        var ReportYear = $scope.searchentity.ReportYear;
        var ReportType = $scope.searchentity.ReportType;

        if (segment == "Arrest") {
            var ageClass = $scope.searchentity.AgeClass;
            if (ageClass == "ALL" || ageClass == "All")
                $scope.TableTitle = "Number of Total Arrests";
            else if (ageClass == "A")
                $scope.TableTitle = "Number of Adult Arrests";
            else
                $scope.TableTitle = "Number of Juvenile Arrests";
        }

        var ReportIDs = "-1";
        if (ReportType == "Agency") {
            $rootScope.RemoveAllFromSelect("AgencyID", "-1");
            ReportIDs = $scope.searchentity.AgencyID;
        }
        else if (ReportType == "County") {
            $rootScope.RemoveAllFromSelect("CountyID", "-1");
            ReportIDs = $scope.searchentity.CountyID;
        }
        else if (ReportType == "Tag") {
            $rootScope.RemoveAllFromSelect("TagID", "-1");
            ReportIDs = $scope.searchentity.TagID;
        }

        if (segment == "Property")
            segment = $scope.searchentity.PropertySubType;

        LoadCrimeDahshboard(segment, ReportYear, ReportType, ReportIDs, $scope.searchentity.AgeClass);
        if (segment != "Offense") {
            ReloadBarChart(segment, ReportYear, ReportType, ReportIDs, "-1", $scope.searchentity.AgeClass);
            ReloadLineChart(segment, ReportYear, ReportType, ReportIDs, "-1", $scope.searchentity.AgeClass, "");
        }
        
    }

    $scope.SetArrestAgeClass = function (ageClass) {
        $scope.searchentity.AgeClass = ageClass;
        $scope.PopulateData('Arrest');
    }

    $scope.SetPropertySubType = function (subType) {
        $scope.searchentity.PropertySubType = subType;
        $scope.PopulateData('Property');
    }
    $scope.ReportTypeChange = function (reportType) {
        $scope.searchentity.ReportType = reportType;
        $scope.searchentity.AgencyID = ["-1"];
        $scope.searchentity.CountyID = ["-1"];
        $scope.searchentity.TagID = ["-1"];
        $scope.PopulateData($scope.searchentity.showingSegment);
    }

}]);




