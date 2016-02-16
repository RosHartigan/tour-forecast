#!"\Dwimperl\perl\bin\perl.exe"
 
# geojson
#
# Creation utilitis for our GeoJSON forecast object
#
# Author: Ros Hartigan, Feb 2016, xrgb.com
#

package geojson;

use JSON;
use DateTime::Format::ISO8601;
use DateTime;
use CGI::Carp;
use Data::Dumper qw(Dumper);


# feature properties:
use constant {
	AREADESCRIPTION => 'areaDescription',
	CREATIONDATE => 'creationDate',
	CREDIT => 'credit',
	CREDITLOGO => 'creditLogo',
	DISCLAIMER => 'disclaimer',
	MOREWEATHERINFO => 'moreWeatherInfo',
	FORECASTSERIES => 'forecastSeries',
	SOURCES => 'sources',
	TIMEZONE => 'timeZone',
	TIMEZONEOFFSET => 'timeZoneOffset',
	TIMEZONEABBR => 'timeZoneAbbr',
	REFRESH => 'refresh'
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

	my @lonlatArray =  ($lon, $lat);
	my $lonLatString = "$lon, $lat";	

	my $feature = {
		type => "Feature",
		id => $lonLatString,
		geometry => {
			type => "Point",
			coordinates =>\@lonlatArray
		}
	};

	$feature->{properties}{+SOURCES} = ();

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

sub getLonLat(\%) {
	my $feature = shift;
	
	my @coords = @{$feature->{geometry}{coordinates}};

	return @coords;

}

sub setTimeZone(\%$) {
	my $feature = shift;
	my $datetime_str = shift;

	#if( not defined($feature->{properties}{+TIMEZONE}) || not defined($feature->{properties}{+TIMEZONEOFFSET})) {
		my $dt = eval {
			DateTime::Format::ISO8601->parse_datetime( $datetime_str );
		};
			
		if( defined($dt)) {

			if( $dt->offset() ne 0 ) {
				$feature->{properties}{+TIMEZONEOFFSET} = $dt->offset();
			}
			
			my $tz = $dt->time_zone();

			if( defined($tz) && not $tz->is_utc() ) {
				$feature->{properties}{+TIMEZONE} = $tz->name();
				if( $tz->is_olson() ) {
					$feature->{properties}{+TIMEZONEABBR} = $tz->short_name_for_datetime( $dt );
				}
			}

		}
	#}	
}

1;