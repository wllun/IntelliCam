Pod::Spec.new do |s|
  s.name             = 'IntelliCamMultiFrameProcessor'
  s.version          = '1.0.0'
  s.summary          = 'Native aligned multi-frame image processing for IntelliCam.'
  s.description      = 'Aligns burst frames and rejects motion before mode-specific compositing.'
  s.license          = { :type => 'MIT' }
  s.author           = 'IntelliCam'
  s.homepage         = 'https://example.invalid/intellicam'
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
