#!"\Dwimperl\perl\bin\perl.exe"
 
# geojson
#
# Creation utilitis for our GeoJSON forecast object
#
# Author: Ros Hartigan, Feb 2016, xrgb.com
#

package GeoJSON;

use JSON;
use DateTime::Format::ISO8601;
use DateTime;
use CGI::Carp;
use Data::Dumper qw(Dumper);


# feature properties:
use constant {
	SOURCES => 'sources',
	FORECASTSERIES => 'forecastSeries',
	AREADESCRIPTION => 'areaDescription',
	TIMEZONE => 'timeZone'
};

# forecast series properties
use constant {
	WEATHERTEXT => 'weatherText',
	WEATHERSUMMARY => 'weatherSummary',
	WEATHERICON => 'weatherIcon',
	TEMPERATURE => 'temperature',
	HAZARDS => 'hazards',
	TIMESTART_UTC => 'timeStartUTC',
	TIMEEND_UTC => 'timeEndUTC',
};
use constant {
	NWSICONDIR => 'http://forecast.weather.gov/images/wtf/small/'
};

#initalize geojson freature
sub create_feature($$) {
	my $lat = shift;
	my $lon = shift;

	my $latLonString =  $lat.",".$lon;
		
	my $feature = {
		type => "Feature",
		id => $latLonString,
		geometry => {
			type => "Point",
			coordinates => $latLonString
		}
		
	};

	return $feature;
}

# create the time key for a slot in the forecast series
# create and initialize the entry
sub create_time_slot(\%$$) {
	my $feature = shift;
	my $start_date = shift;
	my $end_date = shift;

	if( not defined($end_date) ) {
		$end_date = DateTime->from_epoch(epoch => $start_date->epoch() + 60*60);
	}
	my $time_key = $start_date->iso8601().",". $end_date->iso8601();

	$feature->{properties}{+FORECASTSERIES}{$time_key}{+TIMESTART_UTC} = $start_date->iso8601();
	$feature->{properties}{+FORECASTSERIES}{$time_key}{+TIMEEND_UTC} = $end_date->iso8601();
	
	return $time_key;
}

sub getLatLon(\%) {
	my $feature = shift;
	
	my $latLonString = $feature->{geometry}{coordinates};

	my @coords = split(',',$latLonString);
	return @coords;

}

1;