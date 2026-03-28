/**************************************************************************************/
// Crime Rate JQGrid

var d = new Date();
var year1 = d.getFullYear() - 1;
var year2 = d.getFullYear();
var month = d.getMonth() + 1;
var grid_selector = "#crimeratetable";
var isMapSelected = true;

jQuery(function ($) {

    var parent_column = $(grid_selector).closest('[class*="col-"]');
    //resize to fit page size
    $(window).on('resize.jqGrid', function () {
        $(grid_selector).jqGrid('setGridWidth', parent_column.width());
    })
    //resize on sidebar collapse/expand
    $(document).on('settings.ace.jqGrid', function (ev, event_name, collapsed) {
        if (event_name === 'sidebar_collapsed' || event_name === 'main_container_fixed') {
            //setTimeout is for webkit only to give time for DOM changes and then redraw!!!
            setTimeout(function () {
                $(grid_selector).jqGrid('setGridWidth', parent_column.width());
            }, 0);
        }
    })
});

function editlinkformatter(cellvalue, options, cellobject) {
    return "<a href=\"javascript:;\" onclick=\"OnEdit(" + options.rowId + ")\" >&nbsp;<i class=\"hidden-xs ace-icon fa fa-pencil-square-o bigger-110\"></i></a>";
}

function linkunformat(cellvalue, options, cellobject) {
    return cellvalue;
}

function progressbarformatter(cellvalue, options, rowObject) {
    var style = cellvalue >= 0 ? " style='color:red;'" : " style='color:green;'";
    var cellFormattedValue;
    if (rowObject.OffenseByYear1 == 0) {
        style = " style='color:grey;'"
        cellFormattedValue = "-";
}
    else
    {
        cellFormattedValue = thousandSep(cellvalue.toFixed(2));
    }
    return "<strong" + style + ">" + cellFormattedValue + "</strong>";
}

function OnEdit(id) {

}

/**************************************************************************************/

/**************************************************************************************/
// Offense Rate JQGrid

var grid_selector_o = "#offratetable";

jQuery(function ($) {

    var parent_column = $(grid_selector_o).closest('[class*="col-"]');
    //resize to fit page size
    $(window).on('resize.jqGrid', function () {
        $(grid_selector_o).jqGrid('setGridWidth', parent_column.width());
    })
    //resize on sidebar collapse/expand
    $(document).on('settings.ace.jqGrid', function (ev, event_name, collapsed) {
        if (event_name === 'sidebar_collapsed' || event_name === 'main_container_fixed') {
            //setTimeout is for webkit only to give time for DOM changes and then redraw!!!
            setTimeout(function () {
                $(grid_selector_o).jqGrid('setGridWidth', parent_column.width());
            }, 0);
        }
    })
});

function arrowformatter(cellvalue, options, rowObject) {
    var faIcon = cellvalue <= 0 ? cellvalue == 0 ? "" : "fa fa-arrow-down green bigger-120" : "fa fa-arrow-up red bigger-120";
    var cellFormattedValue;
    if (rowObject.OffenseByYear1 == 0)
    {
        cellFormattedValue = "-";
}
    else
    {
        cellFormattedValue = thousandSep(cellvalue.toFixed(2));
    }
    return "<div><strong>" + cellFormattedValue + "</strong>&nbsp;<i class='" + faIcon + "'></i></div>";
}

/**************************************************************************************/


$(document).ready(function () {
    $('body').on('click', function (e) {
        if (!$('div.dropdown.mega-dropdown').is(e.target)
            && $('div.dropdown.mega-dropdown').has(e.target).length === 0
            && $('div.dropdown.mega-dropdown.open').has(e.target).length === 0) {
            var scope = angular.element(document.getElementById("dashboard-form")).scope();
            scope.$apply(function () {
                scope.CrimeRateDashboard.ShowSearch = false;
            });
        }
    });

});
app.controller('CrimeRateDashboardController', ['$scope', '$sce', '$http', 'pageMessageService', function ($scope, $sce, $http, pageMessageService) {
    $scope.CrimeRateDashboard = [];

    /* For IL Public portal, show Grp A & Grp B Trends Comparison reports */
    $scope.Tiles = [];
    $scope.GroupATrendsComparison = [];
    $scope.GroupBTrendsComparison = [];
    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    $scope.init = function (crimeRateDashboard, perPopulation, showPreviousYearInCrimeRateDashboard) {
        $scope.PerPopulation = perPopulation.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        $scope.showPreviousYear = false;
        $scope.currentPeriod = new Date().getFullYear();
        if (showPreviousYearInCrimeRateDashboard == 0) {
            $scope.showPreviousYear = true;
        }
        var showPreviousYear = $scope.showPreviousYear;
        if (crimeRateDashboard != null && crimeRateDashboard != undefined) {
            $scope.CrimeRateDashboard = crimeRateDashboard;
            $scope.CrimeRateDashboard.ReportTitle = $scope.CrimeRateDashboard.ReportTitle.replace("{population}", $scope.PerPopulation);
        }
        else {
            $scope.CreateNewCrimeRateDashboard();
        }

        $scope.LoadPeriodValue();
        $scope.LoadCountyMapCrimeRateTable(true);

        /*NIBRS - 6495 - Set up INTERNAL public portal for IL - Following code block should be called in IL Public Portal alone*/
        if (stateCode == "IL" && isPublicPortal == "true") {
            $scope.CreateNewTrendComparisonReport();
            $scope.PopulateGroupATrendComparison($scope.GroupATrendsComparison, 51);
            $scope.PopulateGroupBTrendComparison($scope.GroupBTrendsComparison, 52);

            if ($scope.entities != null && $scope.entities != undefined && $scope.entities.length > 0) {
                $scope.Tiles = $scope.entities;
                $scope.LoadHighChartColors();
                $scope.LoadCharts();
            }
            else {
                $scope.LoadHighChartColors();
            }
       }
      
    }

    /* Load Grp A Trends Comparison high chart*/
    $scope.PopulateGroupATrendComparison = function (dashboardModel, index) {
        dashboardModel.ShowLoading = true;
        var url = applicationURL +
            'GetDashboardTrendsComparisonData?year=' + dashboardModel.PeriodValue +
            '&range=' + dashboardModel.Range +
            '&offenseCode=' + "GRA" ;
        pageMessageService.Get(url).then(function (result){
            entity = result.data;
            $('#loadingContainer51').hide();
            var Criteria = "Criteria: Agency: All, Offense: Group A Offense, Date Range: ".concat((dashboardModel.PeriodValue - dashboardModel.Range), " - ", dashboardModel.PeriodValue);
            $scope.LoadOffenseLineChart(dashboardModel, dashboardModel.TileID, entity, entity.FromYear, entity.ToYear, Criteria, 'Number of Incidents');
            dashboardModel.ShowSearch = false;
            dashboardModel.ShowLoading = false;
        });
    }

        /* Load Grp B Trends Comparison high chart*/
    $scope.PopulateGroupBTrendComparison = function (dashboardModel, index) {
        dashboardModel.ShowLoading = true;
       var url = applicationURL +
            'GetDashboardTrendsComparisonData?year=' + dashboardModel.PeriodValue +
            '&range=' + dashboardModel.Range +
            '&offenseCode=' + "GRB";
        pageMessageService.Get(url).then(function (result) {
            entity = result.data;
            $('#loadingContainer52').hide();
            var Criteria = "Criteria: Agency: All, Offense: Group B Offense, Date Range: ".concat((dashboardModel.PeriodValue - dashboardModel.Range), " - ", dashboardModel.PeriodValue);
            $scope.LoadOffenseLineChart(dashboardModel, dashboardModel.TileID, entity, entity.FromYear, entity.ToYear, Criteria, 'Number of Arrests');
            dashboardModel.ShowSearch = false;
            dashboardModel.ShowLoading = false;
        });

    }
    $scope.CreateNewCrimeRateDashboard = function () {
        $scope.CrimeRateDashboard = [];
        var period = new Date().getFullYear() - 1;
        var reportTitle = "Crime Rate per " + $scope.PerPopulation + " Population";
        var crimeRateDashboardModel = { TileID: 99, DashboardUserID: 0, ID: 0, DashboardReportID: 5, ReportTypeCode: "CR", AgencyID: -1, PeriodType: "Y", PeriodValue: period, OffenseType: "ALL", PopulationGroup: "A", GeographicType: "-1", ReportTitle: reportTitle };
        $scope.CrimeRateDashboard = crimeRateDashboardModel;
    }

    /* Set up both Grp A & Grp B Trends Comparison tiles */
    $scope.CreateNewTrendComparisonReport = function () {
        $scope.GroupATrendsComparison = [];
        $scope.GroupBTrendsComparison = [];
        var groupATCModel = { TileID: 51, DashboardUserID: 0, ID: 0, DashboardReportID: 1, ReportTypeCode: "TC", AgencyID: -1, PeriodValue: $scope.currentPeriod, Range: "1", OffenseCode: "GRA", ReportTitle: "Group A Trends Comparison" };
        var groupBTCModel = { TileID: 52, DashboardUserID: 0, ID: 0, DashboardReportID: 1, ReportTypeCode: "TC", AgencyID: -1, PeriodValue: $scope.currentPeriod, Range: "1", OffenseCode: "GRB", ReportTitle: "Group B Trends Comparison" };
        $scope.GroupATrendsComparison = groupATCModel;
        $scope.GroupBTrendsComparison = groupBTCModel;

    }

    $scope.UpdateTrendComparison = function (dashboardModel, index) {
        dashboardModel.ShowSearch = false;
        $("#loadingContainer" + index).show();
        $("#Container" + index).hide();
        if (index == 52) {
            $scope.PopulateGroupBTrendComparison(dashboardModel, 52);
        }
        else {
            $scope.PopulateGroupATrendComparison(dashboardModel, 51);
        }
    }

    $scope.LoadCharts = function () {
        if ($scope.Tiles != null) {
            for (var i = 0; i < $scope.Tiles.length; i++) {
                var entity = $scope.Tiles[i];
                $scope.LoadReportByType(entity);
            }
        }
    }
    $scope.LoadHighChartColors = function () {
        Highcharts.getOptions().colors = Highcharts.map(Highcharts.getOptions().colors, function (color) {
            return {
                radialGradient: {
                    cx: 0.5,
                    cy: 0.3,
                    r: 0.1
                },
                stops: [
                    [0, color],
                    [1, Highcharts.Color(color).brighten(-0.3).get('rgb')] // darken
                ]
            };
        });

    }

    $scope.LoadReportByType = function (entity) {
        $scope.LoadOffenseLineChart(entity.DashboardModel, entity.DashboardModel.TileID, entity.JsonResult.Data, entity.JsonResult.Data.FromYear, entity.JsonResult.Data.ToYear, entity.DashboardModel.ReportCriteria, 'Number of Incidents');
    }


    $scope.LoadCountyMapCrimeRateTable = function (isFromInit) {
        $("#reportcriteria span").html($scope.CrimeRateDashboard.ReportCriteria);
        $("#maploading").show();
        pageMessageService.ResetValidationMessages();
        var year = ($scope.CrimeRateDashboard.PeriodType == "Y" ? $scope.CrimeRateDashboard.PeriodValue : year2);
        var url = applicationURL + 
                    'GetCrimeDensityForReportDashboard?year=' + year +
                    '&months=' + $scope.getCommaSeperatedMonthNos() +
                    '&offenseType=' + $scope.CrimeRateDashboard.OffenseType +
                    '&populationGroup=' + $scope.CrimeRateDashboard.PopulationGroup +
                    '&geographicType=' + $scope.CrimeRateDashboard.GeographicType +
                    '&countycodes=-1';
        pageMessageService.Get(url).then(function (result) {
            $http.get(applicationURL + 'GetDefaultStateforMap').then(function (defaultState) {
                if (isFromInit) {
                    $scope.LoadCountyGrid("-1");
                    $scope.LoadOffenseGrid("-1");
                }
                else {
                    $scope.LoadCountyRateTable("-1");
                    $scope.LoadOffenseRateTable("-1");
                }

                var chartTitle = "Crime Density by County for " + year;
                $scope.LoadInteractiveMap(result.data, chartTitle, defaultState.data);
            });
        });
    }

    function sortBy(colName) {
        return function (a, b) {
            if (a[colName] > b[colName]) {
                return 1;
            } else if (a[colName] < b[colName]) {
                return -1;
            }
            return 0;
        }
    }

    $scope.LoadInteractiveMap = function (result, title, defaultState) {

        var map = defaultState.list[0].stateAbbreviation.toLowerCase();
        var perPopulationSubTitle = ''
        if (defaultState.IsPerPopulationRequired.toString().toLowerCase() == 'true')
            perPopulationSubTitle = 'per ' + defaultState.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' population';
        $.getScript('https://code.highcharts.com/mapdata/countries/us/us-' + map + '-all.js', function () {

            var data = Highcharts.geojson(Highcharts.maps['countries/us/us-' + map + '-all']),
                // Some responsiveness
                small = $('#container').width() < 400;

            // Set drilldown pointers
            $.each(data, function (i) {
                this.id = data[i].properties.fips;
                this.drilldown = result.entity[i].countycode;
                //this.value = result.entity[i].offensecount;

                var fipsCode = data[i].properties.fips;
                angular.forEach(result.entity, function (j) {
                    if (j.countycode === fipsCode) {
                        data[i].value = j.offensecount;
                    }
                });
            });

            data.sort(sortBy("name"));
            $("#maploading").hide();
            Highcharts.setOptions({
                lang: {
                    thousandsSep: ','
                },
                exporting: { filename: title }
            });

            var countryChart;

            // Wrap point.select to get to the total selected points
            Highcharts.wrap(Highcharts.Point.prototype, 'select', function (proceed) {

                proceed.apply(this, Array.prototype.slice.call(arguments, 1));

                var points = $scope.mapChart.getSelectedPoints();
                var countycodes = "";

                if (points.length) {
                    $.each(points, function (i) {
                        countycodes += points[i].properties.fips + ",";
                    });

                    countycodes = countycodes.replace(/(^,)|(,$)/g, "");
                }
                else {
                    countycodes = "-1";
                }

                if (isMapSelected) {
                    $scope.LoadCountyRateTable(countycodes);
                    $scope.LoadOffenseRateTable(countycodes);
                }
            });

            // Initiate the map chart
            $scope.mapChart = $('#mcontainer').highcharts('Map', {

                chart: {
                    height: 320
                },

                title: {
                    text: title
                    , style: {
                        fontSize: '13px'
                    }
                },
                subtitle: {
                    text: 'Ctrl/Shift + Click on map to select counties',
                    style: {
                        fontSize: '10px'
                    }
                },
                mapNavigation: {
                    enabled: true,
                    buttonOptions: {
                        verticalAlign: 'bottom'
                    }
                },

                credits: {
                    enabled: false
                },

                legend: {
                    layout: 'vertical',
                    align: 'right',
                    verticalAlign: 'middle',
                    labels: {
                        style: {
                            paddingLeft: '0px',
                            paddingRight: '0px',
                            paddingTop: '0px',
                            paddingBottom: '0px',
                        }
                    }
                },

                colorAxis: {
                    min: 0,
                    minColor: '#E6E7E8',
                    maxColor: '#c4463a'
                },

                tooltip: {
                    footerFormat: '<span style="font-size: 10px">(Click for details)</span>'
                },

                plotOptions: {
                    map: {
                        states: {
                            hover: {
                                color: '#EEDD66'
                            }
                        }
                    }
                },

                series: [{
                    data: data,
                    //mapData: data,
                    //joinBy: ['iso-a3', 'code3'],
                    name: defaultState.list[0].state,
                    allowPointSelect: true,
                    cursor: 'pointer',
                    states: {
                        select: {
                            color: '#a4edba',
                            borderColor: 'black',
                            dashStyle: 'shortdot'
                        }
                    },
                    dataLabels: {
                        enabled: false,
                        color: 'red',
                        format: '{point.properties.name}'

                    }
                }]
            }).highcharts();
        });
    }

    $scope.LoadCountyGrid = function (countycodes) {
        var url = applicationURL +
                    'GetCrimeRateByCounty?year1=' + $scope.getYear1() +
                    '&year2=' + $scope.getYear2() +
                    '&months=' + $scope.getCommaSeperatedMonthNos() +
                    '&offenseType=' + $scope.CrimeRateDashboard.OffenseType +
                    '&populationGroup=' + $scope.CrimeRateDashboard.PopulationGroup +
                    '&geographicType=' + $scope.CrimeRateDashboard.GeographicType +
                    '&countycodes=' + countycodes;
        var showPreviousYr = $scope.showPreviousYear;
        jQuery(grid_selector).jqGrid({
            url: url,
            datatype: "json",
            height: 292,

            onSelectRow: function (rowid, isSelected) {
                isMapSelected = false;
                var object = $(grid_selector).jqGrid('getRowData', $(grid_selector).jqGrid('getGridParam', 'selrow'));
                if (!$scope.mapChart.get(object.CountyCode).selected) {
                $scope.mapChart.get(object.CountyCode).select();
                }
                $scope.LoadOffenseRateTable(object.CountyCode);
                isMapSelected = true;
            },

            beforeSelectRow: function (rowid, e) {
                jQuery(grid_selector).jqGrid('resetSelection');
                return (true);
            },

            onSelectAll: function (rowid) {
                var selected = $(grid_selector).jqGrid('getGridParam', 'selarrrow');

                var countycodes = '';
                $.each(selected, function (id) {
                    var object = $(grid_selector).jqGrid('getRowData', id + 1);
                    if (id == 0) {
                        isMapSelected = false;
                        if (!$scope.mapChart.get(object.CountyCode).selected) {
                        $scope.mapChart.get(object.CountyCode).select();
                        }
                        isMapSelected = true;
                    }
                    countycodes += object.CountyCode + ",";
                });

                countycodes = countycodes.replace(/(^,)|(,$)/g, "");
                $scope.LoadOffenseRateTable(countycodes);
            },

            colNames: ['County Code', 'County', $scope.getYear1(), $scope.getYear2(), '% Change'],
            colModel: [
                { name: 'CountyCode', index: 'CountyCode', hidden: true, width: 25 },
                { name: 'CountyDesc', index: 'CountyDesc', width: 100 },
                { name: 'OffenseByYear1', index: 'OffenseByYear1', width: 50, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: 'integer', hidden: !showPreviousYr },
                { name: 'OffenseByYear2', index: 'OffenseByYear2', width: 50, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: 'integer' },
                { name: 'PercentageChange', index: 'PercentageChange', width: 100, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: arrowformatter },
            ],

            rowNum: 1000,
            toppager: false,
            cloneToTop: true,
            //multiselect: true,
            //multiboxonly: true,
            sortname: 'CountyDesc',
            viewrecords: true,
            sortorder: 'asc',
            loadonce: true,

            loadComplete: function () {
            }
        });

        $(window).triggerHandler('resize.jqGrid');
    }

    $scope.LoadOffenseGrid = function (countycodes) {
        var url = applicationURL +
                    'GetCrimeRateByOffense?year1=' + $scope.getYear1() +
                    '&year2=' + $scope.getYear2() +
                    '&months=' + $scope.getCommaSeperatedMonthNos() +
                    '&offenseType=' + $scope.CrimeRateDashboard.OffenseType +
                    '&populationGroup=' + $scope.CrimeRateDashboard.PopulationGroup +
                    '&geographicType=' + $scope.CrimeRateDashboard.GeographicType +
                    '&countycodes=' + countycodes;
        var showPreviousYr = $scope.showPreviousYear;
        jQuery(grid_selector_o).jqGrid({
            url: url,
            datatype: "json",
            height: 292,

            colNames: ['Offense', $scope.getYear1(), $scope.getYear2(), '% Change'],
            colModel: [
                { name: 'OffenseDesc', index: 'OffenseDesc', width: 100 },
                { name: 'OffenseByYear1', index: 'OffenseByYear1', width: 40, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: 'integer', hidden: !showPreviousYr },
                { name: 'OffenseByYear2', index: 'OffenseByYear2', width: 40, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: 'integer' },
                { name: 'PercentageChange', index: 'PercentageChange', width: 80, align: "right", sorttype: "int", formoptions: { thousandsSeparator: "," }, formatter: arrowformatter },
            ],

            rowNum: 1000,
            toppager: false,
            cloneToTop: true,
            sortname: 'PercentageChange',
            viewrecords: true,
            sortorder: 'desc',
            loadonce: true,

            loadComplete: function () {
            }
        });
        $(window).triggerHandler('resize.jqGrid');
    }

    $scope.LoadCountyRateTable = function (countycodes) {
        $(grid_selector).jqGrid('GridUnload');
        $scope.LoadCountyGrid(countycodes);
    }

    $scope.LoadOffenseRateTable = function (countycodes) {
        $(grid_selector_o).jqGrid('GridUnload');
        $scope.LoadOffenseGrid(countycodes);
    }

    $scope.getYear1 = function () {
        return ($scope.CrimeRateDashboard.PeriodType == "Y" ? (parseInt($scope.CrimeRateDashboard.PeriodValue) - 1).toString() : year1);
    }

    $scope.getYear2 = function () {
        return ($scope.CrimeRateDashboard.PeriodType == "Y" ? $scope.CrimeRateDashboard.PeriodValue : year2);
    }

    $scope.getCol1Title = function () {
        switch ($scope.CrimeRateDashboard.PeriodType) {
            case "Y":
                return (parseInt($scope.CrimeRateDashboard.PeriodValue) - 1).toString();
                break;
            case "Q":
                return "Q" + parseInt($scope.CrimeRateDashboard.PeriodValue).toString() + " " + year1;
                break;
            case "M":
                var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return months[parseInt($scope.CrimeRateDashboard.PeriodValue)] + " " + year1;
                break;
        }
    }

    $scope.getCol2Title = function () {
        switch ($scope.CrimeRateDashboard.PeriodType) {
            case "Y":
                return parseInt($scope.CrimeRateDashboard.PeriodValue).toString();
                break;
            case "Q":
                return "Q" + parseInt($scope.CrimeRateDashboard.PeriodValue).toString() + " " + year2;
                break;
            case "M":
                var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return months[parseInt($scope.CrimeRateDashboard.PeriodValue)] + " " + year2;
                break;
        }
    }

    $scope.RenderOffenseBlocksHtml = function () {
        return $sce.trustAsHtml($scope.offenseBlocksHTML);
    };

    $scope.GetReportTitle = function (entity) {
        var criteria = [];
        criteria.push(entity.AgencyID == "-1" ? "Agency: All" : "Agency: " + $("#ddlAgencyID" + entity.TileID + " option:selected").text());
        criteria.push(entity.OffenseCode == "-1" ? "Offense: All" : "Offense: " + $("#ddlOffense" + entity.TileID + " option:selected").text().replaceAll("-", ""));
        criteria.push("Date Range: " + $("#ddlDateRange" + entity.TileID + " option:selected").text());
        return "Criteria: " + criteria.join(", ");
    }

    $scope.ResetShowSearch = function () {
        $.each($scope.Tiles, function (i) {
            $scope.Tiles[i].DashboardModel.ShowSearch = false;
        });
        $scope.CrimeRateDashboard.ShowSearch = false;
    }

    /* Search in each tile*/
    $scope.OpenReportCriteria = function (index, event) {
        /* Group A Trends Comparison*/
        if (index == 51) {
            $scope.GroupATrendsComparison.ShowSearch = !$scope.GroupATrendsComparison.ShowSearch;
        }
        /* Group B Trends Comparison*/
        else if (index == 52) {
            $scope.GroupBTrendsComparison.ShowSearch = !$scope.GroupBTrendsComparison.ShowSearch;
        }
         /* Crime Rate Dashboard tile*/
        else if (index != 99) {
            $.each($scope.Tiles, function (i) {
                if (index != i)
                    $scope.Tiles[i].DashboardModel.ShowSearch = false;
            });

            $scope.Tiles[index].DashboardModel.ShowSearch = !$scope.Tiles[index].DashboardModel.ShowSearch
            $scope.CrimeRateDashboard.ShowSearch = false;
        }
        else {
            $.each($scope.Tiles, function (i) {
                $scope.Tiles[i].DashboardModel.ShowSearch = false;
            });

            $scope.CrimeRateDashboard.ShowSearch = !$scope.CrimeRateDashboard.ShowSearch;
        }
    }

    $scope.UpdateCrimeRateReport = function (dashboardModel, index) {
        dashboardModel.ShowLoading = true;
        pageMessageService.Post(applicationURL + 'UpdateCrimeRatePreference', { entity: dashboardModel }).then(function (result) {
            $scope.CrimeRateDashboard = result.data;
            $scope.CrimeRateDashboard.ReportTitle = $scope.CrimeRateDashboard.ReportTitle.replace("{population}", $scope.PerPopulation);
            dashboardModel.ShowSearch = false;
            dashboardModel.ShowLoading = false;
            $scope.LoadCountyMapCrimeRateTable();
        });
    }

    $scope.LoadPeriodValue = function () {
        var d = new Date();
        $scope.Periods = [];
        switch ($scope.CrimeRateDashboard.PeriodType) {
            case "Y":
                var offset = 10;

                var thisYear = d.getFullYear();
                
                for (var i = thisYear; i >= thisYear - offset; i--) {
                    $scope.Periods.push({ key: i.toString(), value: i.toString() });
                }
                $scope.CrimeRateDashboard.PeriodValue = $scope.CrimeRateDashboard.PeriodValue == undefined ? thisYear : $scope.CrimeRateDashboard.PeriodValue;
                break;
            case "Q":
                $scope.Periods.push({ key: "1", value: "Q1" });
                $scope.Periods.push({ key: "2", value: "Q2" });
                $scope.Periods.push({ key: "3", value: "Q3" });
                $scope.Periods.push({ key: "4", value: "Q4" });

                $scope.CrimeRateDashboard.PeriodValue = $scope.CrimeRateDashboard.PeriodValue == undefined ? $scope.getQuarter(d) : $scope.CrimeRateDashboard.PeriodValue;
                break;
            case "M":
                $scope.Periods.push({ key: "1", value: "Jan" });
                $scope.Periods.push({ key: "2", value: "Feb" });
                $scope.Periods.push({ key: "3", value: "Mar" });
                $scope.Periods.push({ key: "4", value: "Apr" });
                $scope.Periods.push({ key: "5", value: "May" });
                $scope.Periods.push({ key: "6", value: "Jun" });
                $scope.Periods.push({ key: "7", value: "Jul" });
                $scope.Periods.push({ key: "8", value: "Aug" });
                $scope.Periods.push({ key: "9", value: "Sep" });
                $scope.Periods.push({ key: "10", value: "Oct" });
                $scope.Periods.push({ key: "11", value: "Nov" });
                $scope.Periods.push({ key: "12", value: "Dec" });

                $scope.CrimeRateDashboard.PeriodValue = $scope.CrimeRateDashboard.PeriodValue == undefined ? d.getMonth() + 1 : $scope.CrimeRateDashboard.PeriodValue;
                break;
        }
    }

    $scope.getQuarter = function(d) {
        d = d || new Date(); // If no date supplied, use today
        var q = [1, 2, 3, 4];
        return q[Math.floor(d.getMonth() / 3)];
    }

    $scope.getCommaSeperatedMonthNos = function () {
        switch ($scope.CrimeRateDashboard.PeriodType) {
            case "Y":
                var now = new Date();
                var lastMonth = ($scope.CrimeRateDashboard.PeriodValue == now.getFullYear()) ? now.getMonth() : 11;
                var months = '';
                for (var i = 0; i <= lastMonth; i++) {
                    months += (i+1).toString() + ",";
                }
                return months.replace(/(^,)|(,$)/g, "");
                break;
            case "Q":
                var quarterNo = $scope.CrimeRateDashboard.PeriodValue;
                switch (quarterNo) {
                    case 1:
                        return "1,2,3";
                        break;
                    case 2:
                        return "4,5,6";
                        break;
                    case 3:
                        return "7,8,9";
                        break;
                    case 4:
                        return "10,11,12";
                        break;
                }
                break;
            case "M":
                return $scope.CrimeRateDashboard.PeriodValue;
                break;
        }
    }

    $scope.LoadOffenseLineChart = function (entity, tileId, result, label1, label2, title, yaxisTitle) {
        setTimeout(function () {
            Highcharts.setOptions({
                lang: {
                    thousandsSep: ','
                },
                exporting: {
                    filename: title
                }
            });
            $('#container' + tileId).highcharts({
                chart: {
                    type: 'line',
                    events: {
                        //load: function (event) {
                        //    for (var i = 0; i < loadCallbacks.length; ++i)
                        //        loadCallbacks[i].call(this, event);
                        //}
                    }
                },
                title: {
                    text: title,
                    style: {
                        fontSize: '13px'
                    }
                },
                subtitle: {
                    text: ''
                },
                credits: {
                    enabled: false
                },
                xAxis: {
                    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    , labels: {
                        style: {
                            paddingLeft: '5px',
                            paddingRight: '10px',
                            paddingTop: '0px',
                            paddingBottom: '0px',
                        }
                    }
                },
                yAxis: {
                    title: {
                        text: yaxisTitle
                    },
                    labels: {
                        style: {
                            paddingLeft: '5px',
                            paddingRight: '10px',
                            paddingTop: '0px',
                            paddingBottom: '0px',
                        }
                    }
                },
                plotOptions: {
                    line: {
                        dataLabels: {
                            enabled: true
                        },
                        enableMouseTracking: false
                    }
                },
                series: [{
                    name: label1,
                    data: result.Year1
                }, {
                    name: label2,
                    data: result.Year2
                }]
            });
        }, 500);
    }

    function nFormatter(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'G';
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return num;
    }
}]);


