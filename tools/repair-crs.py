#!/usr/bin/env python3
"""Reproduce Sila's source-control-validated datum and parcel display repair.

Raw inputs stay unchanged and are never copied to the public bundle. Parcel
attributes are never read: output includes geometry and source ordinals only.
The original parcel PRJ remains UNKNOWN; the display CRS is explicitly inferred.
"""
import argparse
import datetime
import hashlib
import json
import logging
import pathlib
import struct
import sys
from collections import Counter, defaultdict


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=pathlib.Path, required=True,
                        help='Actual supplied primary source folders, including houses/buildings/parcels/boundary')
    parser.add_argument('--extra-root', type=pathlib.Path, required=True,
                        help='Actual supplied supplemental folders, including public facilities')
    parser.add_argument('--dependency-dir', type=pathlib.Path,
                        help='Optional installed external GIS dependency directory; never published')
    parser.add_argument('--data-dir', type=pathlib.Path, required=True,
                        help='Existing allowlisted public data directory to repair')
    parser.add_argument('--evidence-output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.dependency_dir:
        sys.path.insert(0, str(args.dependency_dir))
    import numpy as np
    import shapefile
    from pyproj import CRS, Geod, Transformer
    from pyproj.enums import TransformDirection
    from pyproj.transformer import TransformerGroup
    from shapely import make_valid
    from shapely.geometry import Point, shape, mapping
    from shapely.ops import transform, unary_union
    from shapely.strtree import STRtree

    logging.getLogger('shapefile').setLevel(logging.ERROR)
    data = args.data_dir
    geod = Geod(ellps='WGS84')
    before_hashes = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in data.iterdir() if p.is_file()}
    load = lambda name: json.loads((data/name).read_text(encoding='utf-8'))
    catalog, metadata, manifest = (load(n) for n in ('catalog.json','metadata.json','source-manifest.json'))
    groups = TransformerGroup(24048, 4326, always_xy=True)
    selected = next(t for t in groups.transformers if 'Indian 1975 to WGS 84 (2)' in t.description)
    previous = next(t for t in groups.transformers if 'Indian 1975 to WGS 84 (4)' in t.description)

    def safe_polygon(g):
        changed = not g.is_valid
        if changed:
            g = make_valid(g)
        if g.geom_type == 'GeometryCollection':
            parts = [p for p in g.geoms if p.geom_type in ('Polygon','MultiPolygon') and p.area > 0]
            g = unary_union(parts) if parts else g
            changed = True
        return g, changed

    def geom_json(g):
        # Preserve float precision; arbitrary rounding invalidated tiny rings.
        return mapping(g)

    def source_shapes(path):
        out = []
        for ordinal, s in enumerate(shapefile.Reader(shp=str(path)).iterShapes(), 1):
            if not s.points or s.shapeType == 0:
                out.append((ordinal,None,False))
                continue
            g = shape(s.__geo_interface__)
            if g.geom_type in ('Polygon','MultiPolygon'):
                g, repaired = safe_polygon(g)
            else:
                repaired = False
            out.append((ordinal,g,repaired))
        return out

    raw_house_path = args.source_root/'หมุดโรงเรือน'/'B_P002.shp'
    raw_parcel_path = args.source_root/'แปลงที่ดิน(แผนที่ภาษี)'/'parcel.SHP'
    raw_building_path = args.source_root/'เชฟโรงเรือน'/'building.shp'
    raw_municipal_path = args.source_root/'ขอบเขตทม.ศิลา'/'ขอบเขต ทม.ศิลา.shp'
    raw_facility_path = args.extra_root/'สาธารณูปการ'/'สาธารณูปการ.shp'
    for path in (raw_house_path,raw_municipal_path,raw_facility_path):
        actual = CRS.from_wkt(path.with_suffix('.prj').read_text())
        assert actual.to_epsg() == 24048, (path.name,'unexpected declared CRS')
    assert raw_parcel_path.with_suffix('.prj').read_text().strip() == 'UNKNOWN'
    assert CRS.from_wkt(raw_building_path.with_suffix('.prj').read_text()).to_epsg() == 4326
    houses, parcels = source_shapes(raw_house_path), source_shapes(raw_parcel_path)
    assert len(houses)==28783 and len(parcels)==40368

    # Read only the coordinate control column of the house DBF. No source owner,
    # house code, tax ID, phone, cadastral parcel identifier or free text is output.
    dbf = raw_house_path.with_suffix('.dbf').read_bytes()
    head,length = struct.unpack_from('<HH',dbf,8)
    encoding = raw_house_path.with_suffix('.cpg').read_text().strip()
    fields,offset = {},1
    for pos in range(32,head-1,32):
        f=dbf[pos:pos+32]
        name=f[:11].split(b'\0')[0].decode(encoding,'replace')
        fields[name]=(offset,f[16])
        offset+=f[16]
    start,width = fields['Lat_long']
    control_xy, control_ll = [],[]
    for ordinal,g,_ in houses:
        row = dbf[head+(ordinal-1)*length:head+ordinal*length]
        try:
            lat,lon = map(float,row[start:start+width].decode(encoding,'replace').strip().split(','))
        except (ValueError,TypeError):
            continue
        if np.isfinite(lon) and np.isfinite(lat) and 10<lat<22 and 95<lon<107:
            control_xy.append((g.x,g.y));control_ll.append((lon,lat))
    control_xy,control_ll = np.array(control_xy),np.array(control_ll)
    assert len(control_xy)==28594
    datum_tests=[]
    for t in groups.transformers:
        lon,lat=t.transform(control_xy[:,0],control_xy[:,1])
        _,_,dist=geod.inv(lon,lat,control_ll[:,0],control_ll[:,1])
        datum_tests.append({'operation':t.description,'operationAccuracyMetadataM':t.accuracy,
            'controls':len(dist),'medianResidualM':float(np.median(dist)),
            'p90ResidualM':float(np.percentile(dist,90)),'p99ResidualM':float(np.percentile(dist,99)),
            'maxResidualM':float(np.max(dist)),'within0_05M':int((dist<.05).sum()),'within1M':int((dist<1).sum())})
    chosen_test=next(t for t in datum_tests if t['operation']==selected.description)
    assert chosen_test['medianResidualM']<.01 and chosen_test['within1M']>28000

    # Independent supplied WGS84 footprint layer tests the parcel projection
    # family. The held-out set is fixed by source ordinal modulo 3; no fitting,
    # custom translation, ad-hoc registration or place-name geocoding is used.
    parcel_polygons=[g for _,g,_ in parcels if g is not None and g.geom_type in ('Polygon','MultiPolygon')]
    assert len(parcel_polygons)==40368
    parcel_tree=STRtree(parcel_polygons)
    footprint_rows=source_shapes(raw_building_path)
    footprint_points=[(ordinal,g.representative_point()) for ordinal,g,_ in footprint_rows if g is not None and not g.is_empty]
    ref=np.array([(p.x,p.y) for _,p in footprint_points]);ordinals=np.array([o for o,_ in footprint_points])
    heldout=ordinals%3==0
    candidates=[]
    for t in groups.transformers:
        x,y=t.transform(ref[:,0],ref[:,1],direction=TransformDirection.INVERSE)
        points=[Point(a,b) for a,b in zip(x,y)]
        matches=parcel_tree.query(points,predicate='covered_by')
        inside=np.zeros(len(points),dtype=bool);inside[matches[0]]=True
        candidates.append({'candidate':'EPSG:24048 with '+t.description,'referenceFootprints':len(points),
            'insideParcels':int(inside.sum()),'insideFraction':float(inside.mean()),
            'heldoutCount':int(heldout.sum()),'heldoutInside':int(inside[heldout].sum()),
            'heldoutInsideFraction':float(inside[heldout].mean())})
    alternative=Transformer.from_crs(4326,32648,always_xy=True)
    x,y=alternative.transform(ref[:,0],ref[:,1]);points=[Point(a,b) for a,b in zip(x,y)]
    matches=parcel_tree.query(points,predicate='covered_by')
    inside=np.zeros(len(points),dtype=bool);inside[matches[0]]=True
    candidates.append({'candidate':'EPSG:32648 WGS84 UTM48N','referenceFootprints':len(points),
        'insideParcels':int(inside.sum()),'insideFraction':float(inside.mean()),
        'heldoutCount':int(heldout.sum()),'heldoutInside':int(inside[heldout].sum()),
        'heldoutInsideFraction':float(inside[heldout].mean())})
    selected_candidate=next(c for c in candidates if selected.description in c['candidate'])
    assert len(footprint_points)>17000 and selected_candidate['heldoutInsideFraction']>.89
    assert selected_candidate['heldoutInsideFraction']-candidates[-1]['heldoutInsideFraction']>.1
    native_points=[g for _,g,_ in houses]
    matches=parcel_tree.query(native_points,predicate='covered_by')
    native_inside=np.zeros(len(native_points),dtype=bool);native_inside[matches[0]]=True

    affected=['houses.geojson','municipality.geojson','publicfacilities.geojson']
    source_map={'houses.geojson':raw_house_path,'municipality.geojson':raw_municipal_path,
                'publicfacilities.geojson':raw_facility_path}
    updates={}
    for filename in affected:
        obj=load(filename)
        raw=source_shapes(source_map[filename])
        if filename=='municipality.geojson':
            g=unary_union([g for _,g,_ in raw if g is not None])
            projected,_=safe_polygon(transform(selected.transform,g))
            obj['features'][0]['geometry']=geom_json(projected)
        else:
            source_by_ordinal={ordinal:(g,repaired) for ordinal,g,repaired in raw}
            for f in obj['features']:
                g,repaired=source_by_ordinal[f['properties']['sourceRecord']]
                projected=transform(selected.transform,g)
                if projected.geom_type in ('Polygon','MultiPolygon'):
                    projected,post_repaired=safe_polygon(projected)
                    repaired=repaired or post_repaired
                f['geometry']=geom_json(projected)
                f['properties']['geometryDisplayRepair']=repaired
        updates[filename]=obj
    parcel_features=[]
    repair_count=0
    quarantined=[]
    for ordinal,g,repaired in parcels:
        projected=transform(selected.transform,g)
        projected,post_repaired=safe_polygon(projected)
        repaired=repaired or post_repaired
        if projected.geom_type not in ('Polygon','MultiPolygon') or projected.is_empty or projected.area<=0:
            quarantined.append({'sourceRecord':ordinal,'reason':'source degenerate near-zero-area ring becomes nonareal after projection',
                                'nativeAreaM2':g.area,'projectedGeometryType':projected.geom_type})
            continue
        assert projected.is_valid and not projected.is_empty and projected.area>0
        fid=f'parcels-{ordinal:06d}'
        props={'id':fid,'label':f'แปลง #{ordinal}','datasetId':'parcels','sourceRecord':ordinal,
               'sourceFolder':'แปลงที่ดิน(แผนที่ภาษี)','sourceFile':'parcel.SHP',
               'geometryDisplayRepair':bool(repaired),'displayCRSStatus':'inferred_control_validated',
               'taxStatus':'not_supplied'}
        parcel_features.append({'type':'Feature','id':fid,'geometry':geom_json(projected),'properties':props})
        repair_count+=int(repaired)
    updates['parcels.geojson']={'type':'FeatureCollection','features':parcel_features}
    municipal=shape(updates['municipality.geojson']['features'][0]['geometry'])
    village_obj,election_obj=load('villages.geojson'),load('election.geojson')
    v_geoms=[shape(f['geometry']) for f in village_obj['features']]
    e_geoms=[shape(f['geometry']) for f in election_obj['features']]
    v_ids=[f['id'] for f in village_obj['features']];e_ids=[f['id'] for f in election_obj['features']]
    v_tree,e_tree=STRtree(v_geoms),STRtree(e_geoms)
    v_counts,e_counts=defaultdict(Counter),defaultdict(Counter)
    ordinary_ids=['houses','buildings','roads','cctv','education','health','religion','publicfacilities','waterways','parcels']
    municipal_counts={}
    for dataset_id in ordinary_ids:
        filename=dataset_id+'.geojson'
        obj=updates.get(filename) or load(filename)
        municipal_counts[dataset_id]=0
        for f in obj['features']:
            g=shape(f['geometry']);assert g.is_valid and not g.is_empty
            vi=[int(i) for i in v_tree.query(g,predicate='intersects')]
            ei=[int(i) for i in e_tree.query(g,predicate='intersects')]
            vs,es=[v_ids[i] for i in vi],[e_ids[i] for i in ei]
            for vid in vs:v_counts[vid][dataset_id]+=1
            for eid in es:e_counts[eid][dataset_id]+=1
            inside=bool(municipal.intersects(g));municipal_counts[dataset_id]+=int(inside)
            f['properties'].update({'villageIds':vs,'villageId':vs[0] if len(vs)==1 else None,
                'electionIds':es,'electionId':es[0] if len(es)==1 else None,'insideMunicipality':inside})
            assert not {'owner','ownerName','citizenId','taxId','phone','hs_no_code','PARCEL_COD','PARCEL_NO','land_no','โฉนด'}.intersection(f['properties'])
        updates[filename]=obj
    for v in metadata['villages']:
        v['counts']={did:v_counts[v['id']][did] for did in ordinary_ids}
    for e in metadata['elections']:
        e['counts']={did:e_counts[e['id']][did] for did in ordinary_ids}
    metadata['municipality'].update({'bbox':list(municipal.bounds),
        'areaKm2':round(abs(geod.geometry_area_perimeter(municipal)[0])/1e6,4)})
    parcel_dataset=next(d for d in catalog['datasets'] if d['id']=='parcels')
    assert len(parcel_features)==40367 and len(quarantined)==1 and quarantined[0]['sourceRecord']==38721
    parcel_dataset.update({'status':'inferred_control_validated','geometryType':'polygon','mappedCount':len(parcel_features),
        'geojson':'data/parcels.geojson','nullOrUnusableGeometryCount':len(quarantined),'displayRepairCount':repair_count,
        'sourceCRS':['UNKNOWN'],'displayCRS':{'interpretedEPSG':24048,'datumOperation':selected.description,
          'status':'inferred_control_validated','formalSourceCRSConfirmed':False,'evidence':'qa/crs-repair-evidence.json'},
        'nativeGrain':'source polygon record; not verified unique/legal/tax parcel',
        'scopeCountMethod':'actual geometry intersections; crossing/overlap feature may be counted in multiple scopes',
        'privacy':'geometry and version-local source ordinal only; no parcel identifiers, owner/tax IDs, phones, or free text',
        'caveats':['Original parcel PRJ remains UNKNOWN. Display interprets Indian1975 UTM48N through source-coordinate controls and held-out WGS84 footprint comparisons, not official metadata confirmation.',
            '40368 source records;40367mapped polygons. Source record38721 has a degenerate near-zero-area ring and is quarantined.48mapped geometries repaired only for display (46source topology issues+2postprojection). Source bytes unchanged.',
            'Legal parcel boundaries, field position accuracy, ownership, tax status and tax coverage are unverified.',
            'Tax system of record and inventory denominator unavailable. No coverage percentage or unpaid-tax inference.',
            '77 blank parcel codes,47duplicate code groups,5453AREA_METERoverflow tokens remain source-quality facts; no identifying attributes are exported.']})
    for d in catalog['datasets']:
        did=d['id']
        if did in ordinary_ids:
            d['insideMunicipalityCount']=municipal_counts[did]
            d['scopeCounts']={'municipality':municipal_counts[did],
              'villages':{vid:v_counts[vid][did] for vid in v_ids},'elections':{eid:e_counts[eid][did] for eid in e_ids}}
    next(f for f in catalog['folders'] if f['name']=='แปลงที่ดิน(แผนที่ภาษี)')['status']='inferred_control_validated'
    metadata['datasetCountsByScope']={d['id']:d['scopeCounts'] for d in catalog['datasets']}
    metadata['totals']['parcelsMapped']=len(parcel_features)
    metadata['quality']['parcel']['display_geometry_repair_count']=repair_count
    metadata['quality']['parcel']['display_crs_status']='inferred_control_validated_original_PRJ_UNKNOWN'
    folder_to_file={'หมุดโรงเรือน':'houses.geojson','ขอบเขตทม.ศิลา':'municipality.geojson','สาธารณูปการ':'publicfacilities.geojson'}
    for folder in folder_to_file:
        old=metadata['transforms'][folder]
        metadata['transforms'][folder]={**old,'previousOperation':old.get('operation'),
            'operation':selected.description,'accuracyM':selected.accuracy,
            'operationSelection':'house source coordinate contract:28594 numericLat_long controls',
            'fieldAccuracyVerified':False}
    metadata['transforms']['แปลงที่ดิน(แผนที่ภาษี)']={'sourceCRS':'UNKNOWN','displayCRS':'EPSG:24048 inferred',
        'operation':selected.description,'accuracyM':selected.accuracy,
        'formalSourceCRSConfirmed':False,'fieldAccuracyVerified':False,'evidence':'qa/crs-repair-evidence.json'}
    metadata['crsRepair']={'evidence':'qa/crs-repair-evidence.json','selectedDatumOperation':selected.description,
        'existingGeometryLayersCorrected':['houses','municipality','publicfacilities'],
        'parcelDisplayStatus':'inferred_control_validated','unaffectedGeometryLayers':'all other existing layers',
        'municipalTaxCoverageValue':None}
    for item in manifest['files']:
        if item['folder'] in folder_to_file:
            item['previousTransformOperation']=item.get('transformOperation')
            item['transformOperation']=selected.description
            item['transformAccuracyM']=selected.accuracy
        if item['folder']=='แปลงที่ดิน(แผนที่ภาษี)' and item['name']=='parcel.SHP':
            item.update({'outputStatus':'inferred_control_validated_display',
                'sourceCRS':'UNKNOWN','interpretedDisplayCRS':'EPSG:24048',
                'transformOperation':selected.description,'transformAccuracyM':selected.accuracy,
                'formalSourceCRSConfirmed':False,
                'reason':'Source-coordinate control evidence and held-out WGS84 footprint alignment support the display interpretation. OriginalPRJ and sourcebytes unchanged; no owner/tax/parcel-identifying attributes exported.'})
    manifest['transforms']=metadata['transforms']
    updates.update({'catalog.json':catalog,'metadata.json':metadata,'source-manifest.json':manifest})
    # All semantic/source population values remain untouched; tax remains unknown.
    assert metadata['totals']['populationReported']==55838 and metadata['totals']['populationSexSum']==55238
    assert metadata['taxCoverage']['value'] is None and metadata['floodImpact']['value'] is None
    for name,obj in updates.items():
        (data/name).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    after_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in data.iterdir() if p.is_file()}
    source_proof=[]
    for p in (raw_house_path,raw_parcel_path,raw_building_path,raw_municipal_path,raw_facility_path):
        companion_paths=[p.with_suffix(ext) for ext in ('.prj','.shx')]
        if p==raw_house_path:
            companion_paths += [p.with_suffix(ext) for ext in ('.dbf','.cpg')]
        source_proof.append({'folder':p.parent.name,'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
            'companions':[{'name':q.name,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()} for q in companion_paths if q.exists()]})
    evidence={'schemaVersion':'sila-control-validated-crs-repair-1','checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'status':'passed','sourceFiles':source_proof,'originalParcelPRJ':'UNKNOWN',
      'selectedDisplayCRS':'EPSG:24048 Indian1975 UTM48N','selectedDatumOperation':selected.description,
      'selectionMethod':'numeric coordinate-contract controls select datum operation; independent supplied WGS84 footprint holdout tests projection-family alignment',
      'formalParcelCRSConfirmedByOwner':False,'fieldPositionAccuracyVerified':False,'legalBoundaryVerified':False,
      'houseCoordinateControlTests':datum_tests,'parcelProjectionFamilyTests':candidates,
      'holdoutRule':'source footprint ordinal modulo3==0,12949heldout from38847; no fitting or custom shift',
      'nativeHousePointInParcel':{'sourcePointCount':len(native_points),'insideCount':int(native_inside.sum()),'insideFraction':float(native_inside.mean())},
      'crosswalk':'No verified common house↔parcel key. Geometry joins are not ownership or tax entity matching.',
      'affectedExistingGeometryLayers':['houses','municipality','publicfacilities'],
      'newParcelDataset':{'nativeRecords':40368,'mappedRecords':len(parcel_features),'displayRepairCount':repair_count,
        'quarantined':quarantined,'sourceTopologyRepairCount':46,'additionalPostProjectionRepairCount':2,
        'properties':'geometry,source ordinal and spatial membership only; no cadastral/owner/tax identifiers or free-text notes'},
      'countsRecomputedBy':'actual geometry intersections with supplied municipality/villages/derived election boundaries, never bounding-box assignment',
      'insideMunicipalityCounts':municipal_counts,
      'beforeDataSHA256':before_hashes,'afterDataSHA256':after_hashes,
      'limitations':['Source coordinate agreement is not independent field survey accuracy.255 control rows exceed1m; max53.83m.',
        'Parcel display CRS is an evidence-supported inference; originalUNKNOWN metadata remains unchanged.',
        'Operation2and3 nearlyagree; house numeric controls select2. No custom translation or inferred ownership/tax coverage is used.',
        'Display-only geometry repair does not validate legal parcel boundaries.']}
    validation=load('data-validation.json')
    validation.update({'checks':'passed','crsRepairEvidence':'qa/crs-repair-evidence.json',
        'parcelDisplayCRSStatus':'inferred_control_validated_original_PRJ_UNKNOWN',
        'sourceGeometryLayersCorrected':['houses','municipality','publicfacilities'],
        'rawCadastralOwnerTaxIdentifiersExported':False,'taxCoverageVerified':False})
    validation['layers']=[{'id':d['id'],'records':d['count'],'mapped':d['mappedCount'],'status':d['status']} for d in catalog['datasets']]
    validation['outputBytes']={p.name:p.stat().st_size for p in data.iterdir() if p.is_file() and p.name!='data-validation.json'}
    (data/'data-validation.json').write_text(json.dumps(validation,ensure_ascii=False,separators=(',',':')))
    evidence['afterDataSHA256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in data.iterdir() if p.is_file()}
    args.evidence_output.parent.mkdir(parents=True,exist_ok=True)
    args.evidence_output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':'passed','parcelRecords':40368,'parcelsMapped':len(parcel_features),
      'parcelDisplayRepairs':repair_count,'houseControls':len(control_xy),'datumOperation':selected.description,
      'insideMunicipalityCounts':municipal_counts,'evidence':args.evidence_output.name},ensure_ascii=False))


if __name__=='__main__':
    main()
