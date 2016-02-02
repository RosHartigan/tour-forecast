#!/usr/bin/perl	
 
# nws_dwml
#
# Parse the DWML document returned by NWS
# Convert the data into our geoJSON format
#
# Author: Ros Hartigan, Feb 2016, xrgb.com
#

package NWS_DWML;

use XML::LibXML;
use DateTime::Format::ISO8601;
use DateTime;
use CGI::Carp;
use Data::Dumper qw(Dumper);



# 
#	compileForecastFromDWML
#
#	POPULATE geoJSON feature from DWML XML doc	
#	IN: xml doc, feature hash ref

sub compileForecastFromDWML($\%) {
	my ($doc) = shift;
	my ($feature) = shift;

	#in data
	#	get list of locations and their keys
	#	get URL to disclaimer
	# 	get URL to attribution/attribution logo
	#   get list(s) of valid time periods and their keys
 
	# then, for each location
	#   get URL to more weather info
	#   get parameters:
	#    temperature, contains list of values
	#    hazards, condtains list of azard-conditions
	#    weather, condtains list of weather-conditions
	# serialize the structure
	
	my ($lat, $lon) = GeoJSON::getLatLon($feature);

	#get the locations
	my %locations;

	foreach my $location ($doc->findnodes('/dwml/data/location')) {

		my %location;

		my $lk="no location key";
		foreach my $location_key ($location->findnodes('.//location-key[1]') ) {
			$lk = $location_key->textContent;
			$location{'location-key'} = $lk;
		}
		
		# description of location
		foreach my $area_description ($location->findnodes('.//area-description[1]') ) {
			$location{ 'area-description' } = $area_description->textContent;
		}	

		# latitude and longitude
		my $bLatMatches = false;
		my $bLonMatches = false;
		foreach my $location_point ( $location->findnodes('.//point[1]') ) {
			if( $location_point->hasAttributes ) {
				foreach my $attr ( $location_point->attributes ) {
					$location{ $attr->nodeName } = $attr->getValue;
				}
			}
		}
			
		#only return the data for our point
		if( index($lat,$location{'latititude'}) != -1 && index($lon,$location{'longitude'}) != -1  ) {
			$locations{$lk} = \%location;
		}			
		
	} 
	
	#get the time layouts
	my %time_layouts;

	foreach my $time_layout ($doc->findnodes('/dwml/data/time-layout')) {
		my $tk="no time key";
		my $bLocal = 0;
		
		#each key has a format something like:
		# k-p1h-n63-2
		foreach my $layout_key ($time_layout->findnodes('.//layout-key[1]') ) {
			$tk = $layout_key->textContent;
			$time_layouts{$tk}{'layout-key'} = $tk;
		}
		
		# glean the time layouts attributes (local/global)
		if( $time_layout->hasAttributes ) {
			
			foreach my $attr ( $time_layout->attributes ) {
				# check local/global
				if( $attr->nodeName eq "time-coordinate" ) {
					$bLocal = $attr->getValue eq "local";
				}
				# summarization?  not sure what to do if this is true.
				
				$time_layouts{$tk}{ $attr->nodeName } = $attr->getValue;
			}
		}		
		
		my $idx=0;
		foreach my $t ($time_layout->findnodes('./start-valid-time') ) {
			my $datetime_str = $t->textContent;
			my $dt = DateTime::Format::ISO8601->parse_datetime( $datetime_str );
			#print STDERR $datetime_str."\n";
			# check for errors here
			# todo: use bLocal?
			$time_zone = $dt->time_zone();
			$dt->set_time_zone('UTC');
			
			$time_layouts{$tk}{'times'}[$idx] = $dt;
			$idx++;
		}
		# todo: should match nDD segment of time layout key
#		$time_layouts{$tk}{ num_times } = $idx;		

		#print STDERR Dumper $time_layouts{$tk};
	} 
	
	# create feature array for the featureCollection object	
	
	# get weather parameters for each point (only expecting one point at the moment)
	# get specific weather info for each time layout (expecting multiple)
	foreach my $lk  (keys %locations) {
		
		foreach my $mwi ($doc->findnodes('/dwml/data/moreWeatherInformatione[@applicable-location="'.$lk.'"]')) {
			$feature->{'properties'}{'moreWeatherInformation'} = $mwi->textContent;
		}
		
		# now scoop up the forecast info into any array of blocks keyed by time
		foreach my $parameters ($doc->findnodes('/dwml/data/parameters[@applicable-location="'.$lk.'"]')) {
			
			# loop through time layouts
			foreach my $tk  (keys %time_layouts) {
				my %hc;
				
				my %fieldxfer = (
					'temperature' => TEMPERATURE,
					'weather' => WEATHERTEXT,
					'conditions-icon' => WEATHERICON,
					'hazards' => HAZARDS
					);
				
				# loop through weather paramaters
				foreach my $node_name ( keys %fieldxfer ) {
				
					my $node_key = $fieldxfer{$node_name};
					
						# massage the keys to the output we want, as well as get the repeated value
					my $repeated_var = "value";
					if( $node_name eq "weather" ) {
						$repeated_var = "weather-conditions";
					}
					elsif( $node_name eq "hazards" ) {
						$repeated_var = "hazard-conditions";
					}
					elsif( $node_name eq "conditions-icon" ) {
						$repeated_var = "icon-link";
					}

					# get the data for this weather param if it's time layout key matches 
					foreach my $info ($parameters->findnodes('./'.$node_name.'[@time-layout="'.$tk.'"]') ) {
						if( $info->hasAttributes && $node_name eq "temperature") {
							foreach my $attr ( $info->attributes ) {
								if( $attr->nodeName eq "type" && $attr->getValue != "hourly" ) {
									#eg temperature_hourly
									#   temperature_apparent
									$node_key = $node_name."-".$attr->getValue;
								}
							}
						}
					
						
						foreach my $name ($info->findnodes('./name')) {
							$hc{$node_key}{name} = $name->textContent;
						}

						my $idx = 0;
						
						
						# now scoop up the parameter value for each time period
						foreach my $condition ($info->findnodes('./'.$repeated_var) ) {
							my $value = "";
							if( $repeated_var eq "weather-conditions" ) {
								#weather consists of a list of values
								# these values can contain visibility elements which I am ignoring
								# the values elements contain attributes which combine to provide weather text:
								#    coverage, weather-type, intensity describe the weather for each value element
								
								#    additive defines how to combine this weather description with others
								#    qualifiers does what?
															
								foreach my $val ($condition->findnodes('./value')) {
	
									my $coverage_text = "";
									my $post_coverage_text = "";
									my $weathertype_text = "";
									my $intensity_text = "";
									my $qualifier_text = "";
									
									if( $val->hasAttributes ) {
										foreach my $va ( $val->attributes ) {
											if( $va->nodeName eq "coverage" ) {
												if($va->getValue eq "likely" || $va->getValue eq "definitely" ) {
													$post_coverage_text = $va->getValue." ";
												}
												elsif ($va->getValue eq "none") {
												}
												else {
													$coverage_text = $va->getValue." ";
												}
											}
											elsif ( $va->nodeName eq "intensity" ) {
												if ($va->getValue ne "none") {
													$intensity_text = $va->getValue." ";
												}
											}
											elsif ( $va->nodeName eq "weather-type" ) {
												$weathertype_text = $va->getValue." ";
											}
											elsif( $va-nodeName eq "additive" ) {
												$weather_text = $weather_text.$va->getValue." ";
											}
											elsif( $va-nodeName eq "qualifier" ) {
												if ($va->getValue ne "none") {
													$qualifier_text = "(".$va->getValue.") ";
												}
											}
										}
										
										$value = $value.$coverage_text.$intensity_text.$weathertype_text.$qualifier_text;
									}
								}
							}
							elsif ($node_name eq "hazards" ) {
								my @value_array;

								foreach my $hazard ($condition->findnodes('./hazard')) {
	
									my $phenomena_text = "";
									my $significance_text = "";
									
									# first figure out what to call it
									if( $hazard->hasAttributes ) {
										foreach my $va ( $hazard->attributes ) {
											if( $va->getValue ne "none") {
												if( $va->nodeName eq "phenomena" ) {
													
													$phenomena_text = $va->getValue." ";
													
												}
												elsif ( $va->nodeName eq "significance" ) {
													$significance_text = $va->getValue;
												}
											}
										}
										
										$value = $phenomena_text.$significance_text;
									}
									# now get the url
									my $hazard_url = "";
									foreach my $hu ($hazard->findnodes('./hazardTextURL') ) {
										$hazard_url = $hu->textContent;
									}
									
									if( length($value) eq 0 ) {
										$value = $hazard_url;
									}
									elsif( length($hazard_url) ne 0  ) {
										$value = '<a href="'.$hazard_url.'">'.$value.'</a>'
									}
									push(@value_array,$value);
								}
								if( scalar @value_array > 0 ) {
									$value = \@value_array;
								}
								else {
									$value = null;
								}
							}
							else {
								$value = $condition->textContent;
							}

							$hc{$node_key}{values}[$idx] = $value;
							$idx++;
						}
					}
				}
				
				#copy data for each time layout into our single hourly layout
				my $data_array = $time_layouts{$tk}{times};
				for(my $src_idx = 0; $src_idx < scalar (@$data_array) - 1; $src_idx++ ) {
					
					# first check if we have any actual data:
					my $has_data = false;
					foreach my $info_key (keys %hc) {
						my $v = $hc{$info_key}{values}[$src_idx];
						if( defined($v) && $v != null && length($v)>0) {
							$has_data = true;						
						}
					}
					if( $has_data eq true ) {
						my $cur_dt = $data_array->[$src_idx];
						my $next_dt = $data_array->[$src_idx + 1];
						
						#use UTC for key
						my $time_key = GeoJSON::create_time_slot($cur_dt, $next_dt);

						#also pass local time to make our lives easier
						my $lt = $cur_dt->clone();
						$lt->set_time_zone($time_zone);
						
						foreach my $info_key (keys %hc) {
							$feature->{properties}{GeoJSON::FORECASTSERIES}{$time_key}{$info_key} = $hc{$info_key}{values}[$src_idx];
						}
					}
					
				} # looping over times	
			} #looping over time layouts

		} #looping over weather parameters	

	} #looping over locations

}


# eval to true
1;






