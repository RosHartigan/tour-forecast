angular.module('tourForecast.directives',['tourForecast.services', 'ui.bootstrap-slider'])
.directive('weatherStepList', ['forecastService', function(forecastService) {
  return {
    restrict: 'E',
    replace: true,
    scope: {
    	'featureCollection': '='
    },
    templateUrl: 'partials/weather-step-list.html',
    link: function(scope, elem, attrs) {

    	scope.departureTimeIdx=0;
    	scope.departureTimeDisplays = [{'display':"now", 'dateObj':null}];
    	// SLIDING TIME SELECTION
	  // build a list of possible departure times for the slider
	  function rebuildDepartureTimes() {
	      
	      
	    scope.departureTimeIdx = 0;

	    scope.departureTimeDisplays = [{'display':"now", 'dateObj':null}];

	    if( scope.featureCollection.length === 0) {
	      return;
	    }
	    var nextTime = new Date();
	    nextTime.setMinutes(0);
	    nextTime.setSeconds(0);
	    nextTime.setMilliseconds(0);

	    // also add the next few hours
	    addDepartureTime(nextTime, 1);
	    addDepartureTime(nextTime, 1);
	    
	    // every three hours for the first 24, starting on the next multiple of 3
	    nextTime.setHours(nextTime.getHours() - nextTime.getHours() % 3);
	    for( var idx = 0; idx < 24; idx += 3 ) {
	      addDepartureTime(nextTime, 3);
	    }

	    // every 6 hours for the next 48
	    for( var idx = 0; idx < 42; idx += 6 ) {
	      addDepartureTime(nextTime, 6);
	    }
	  };

	  // add a given departure time display and obj to the slider menu
	  function addDepartureTime(theDateTime, theHourOffset) {

	   
	    theDateTime.add({ hours: theHourOffset});

	    var theLocation =  scope.featureCollection[0].properties;
	    var dateTimeString = forecastService.createPrettyLocalDateTime(theLocation.latitude, theLocation.longitude, theDateTime);

	    scope.departureTimeDisplays.push(
	      {
	        'display':dateTimeString, 
	        'dateObj': new Date(theDateTime.getTime())
	      }
	      );
	  }

	   // handle slide events
	  scope.slideDelegate = function (value, event) {
	  	console.log(value);
	    var dt = scope.departureTimeDisplays[value].dateObj;
	      if( dt === null ) {
	        dt = new Date();
	      }
	      
	    scope.featureCollection.forEach(function(geoJSON) {
	      forecastService.updateGeoJSONInstance(geoJSON, dt);
	    });
	  };

	  // watching so we an update the time.... there has to 
	  // be a better way...
	  scope.$watch(
	    function watchForecastModelTimezone( ) {
	        // Return the "result" of the watch expression.
	        
	        if( scope.featureCollection !== undefined && scope.featureCollection.length > 0) {
	          return scope.featureCollection[0].properties.icon;
	        }
	        return( "" );
	    },
	    function handleChange( newValue, oldValue ) {
	    	if( scope.featureCollection !== undefined) {
		        rebuildDepartureTimes();
	    	}
	    }
	  );

    }
  };
}])
.directive('weatherStep', function() {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'partials/weather-step.html',
    link: function(scope, elem, attrs) {
    }
  };
});